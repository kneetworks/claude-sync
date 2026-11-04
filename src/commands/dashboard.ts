import http from "http";
import type { AddressInfo } from "net";
import { randomBytes, timingSafeEqual } from "crypto";
import chalk from "chalk";
import { getBackend, type Config } from "../backends/index.js";
import { loadConfig, saveConfig } from "../utils/config.js";
import { loadDashboardState } from "../utils/conversations.js";
import { isSyncRunning } from "../utils/lock.js";
import { loadLastSync } from "../utils/manifest.js";
import { openApp } from "../utils/open.js";
import { selectConversation, selectProject } from "../utils/selection.js";
import { runningTray } from "../tray/instance.js";
import { syncSilently, type SyncResult } from "./sync.js";
import { dashboardPage } from "./dashboard-page.js";

interface DashboardOptions {
  port?: string;
  /** False with --no-open */
  open?: boolean;
}

export interface DashboardServer {
  /** The page's address, with the access token */
  url: string;
  /** Sync now, or wait for the sync this server already started */
  sync(): Promise<SyncResult>;
  /** True while a sync started here is running */
  isSyncing(): boolean;
}

const MAX_BODY = 64 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  if (res.headersSent) return void res.end();
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw new HttpError(413, "Request too large");
  }
  try {
    const data = JSON.parse(body);
    if (data && typeof data === "object") return data;
  } catch {
    // Reported below
  }
  throw new HttpError(400, "Expected a JSON object");
}

/**
 * Serve the dashboard on this machine only. Used by `claude-sync dashboard` and by
 * the tray icon, which keeps it running in the background.
 */
export async function startDashboardServer(config: Config, port = 0): Promise<DashboardServer> {
  const maxFileSize = await getBackend(config)
    .then((backend) => backend.maxFileSize)
    .catch(() => undefined);

  // Only someone with the link can use the API: another site open in the browser
  // can't send the header, and the Host check stops DNS rebinding
  const token = randomBytes(24).toString("hex");
  const expected = Buffer.from(token);
  const validToken = (value: unknown) =>
    typeof value === "string" &&
    value.length === token.length &&
    timingSafeEqual(Buffer.from(value), expected);
  let allowedHosts = new Set<string>();

  let syncing: Promise<SyncResult> | null = null;
  const sync = () => (syncing ??= syncSilently().finally(() => (syncing = null)));

  const state = async () => {
    // Re-read each time: `claude-sync folder add` may have changed the config meanwhile
    const current = (await loadConfig()) ?? config;
    return {
      ...(await loadDashboardState(current, maxFileSize)),
      syncing: !!syncing || (await isSyncRunning()),
      lastSync: await loadLastSync(),
    };
  };

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!allowedHosts.has(req.headers.host ?? "")) throw new HttpError(403, "Forbidden");
    const { pathname } = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && pathname === "/") {
      const nonce = randomBytes(16).toString("base64");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; ` +
          "connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      res.end(dashboardPage(nonce));
      return;
    }

    if (!pathname.startsWith("/api/")) throw new HttpError(404, "Not found");
    if (!validToken(req.headers["x-claude-sync-token"])) {
      throw new HttpError(401, "Open the link printed by `claude-sync dashboard`");
    }

    if (req.method === "GET" && pathname === "/api/state") {
      return sendJson(res, 200, await state());
    }

    if (req.method === "POST" && pathname === "/api/selection") {
      const { project, conversation, sync } = await readJson(req);
      if (typeof project !== "string" || typeof sync !== "boolean") {
        throw new HttpError(400, "Expected { project, sync }");
      }
      if (conversation !== undefined && (typeof conversation !== "string" || !conversation.startsWith(`${project}/`))) {
        throw new HttpError(400, "The conversation must be in the project");
      }

      const current = await loadConfig();
      if (!current) throw new HttpError(500, "Config missing");
      const selection = conversation
        ? selectConversation(current.selection ?? {}, conversation, sync)
        : selectProject(current.selection ?? {}, project, sync);
      await saveConfig({ ...current, selection });

      return sendJson(res, 200, await state());
    }

    if (req.method === "POST" && pathname === "/api/sync") {
      const result = await sync();
      return sendJson(res, 200, { ...(await state()), result });
    }

    throw new HttpError(404, "Not found");
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) =>
      sendJson(res, error instanceof HttpError ? error.status : 500, { error: errorMessage(error) })
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const { port: actual } = server.address() as AddressInfo;
  allowedHosts = new Set([`127.0.0.1:${actual}`, `localhost:${actual}`]);

  return {
    url: `http://127.0.0.1:${actual}/#${token}`,
    sync,
    isSyncing: () => !!syncing,
  };
}

/**
 * Serve a page on this machine for choosing which conversations sync here
 */
export async function dashboard(options: DashboardOptions): Promise<void> {
  const config = await loadConfig();

  if (!config?.initialized) {
    console.log(chalk.red("Error: claude-sync not initialized. Run `claude-sync init` first."));
    process.exit(1);
  }

  const port = Number(options.port ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.log(chalk.red(`Error: invalid port ${options.port}`));
    process.exit(1);
  }

  // The tray icon already serves the dashboard
  const tray = options.port ? null : await runningTray();
  if (tray) {
    if (options.open === false) console.log(`\n  ${tray.url}\n`);
    else await openApp(tray.url);
    return;
  }

  let server: DashboardServer;
  try {
    server = await startDashboardServer(config, port);
  } catch (error) {
    console.log(chalk.red(`Error: couldn't start the dashboard: ${errorMessage(error)}`));
    process.exit(1);
  }

  console.log(chalk.bold("\nclaude-sync dashboard\n"));
  console.log(`  ${server.url}\n`);
  console.log(chalk.dim("  Press Ctrl+C to stop\n"));
  if (options.open !== false && !(await openApp(server.url))) {
    console.log(chalk.dim("  Couldn't open a browser; open the link yourself\n"));
  }
}
