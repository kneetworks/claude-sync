import fs from "fs/promises";
import http from "http";
import type { AddressInfo } from "net";
import { randomBytes, timingSafeEqual } from "crypto";
import chalk from "chalk";
import { glob } from "glob";
import { getBackend, type Config } from "../backends/index.js";
import { exportKey } from "../crypto/keys.js";
import { loadConfig, saveConfig } from "../utils/config.js";
import { loadDashboardState } from "../utils/conversations.js";
import { isSyncRunning } from "../utils/lock.js";
import { loadLastSync } from "../utils/manifest.js";
import { openApp, openWithSystem } from "../utils/open.js";
import { selectConversation, selectProject } from "../utils/selection.js";
import { isAutostartEnabled, setStartAtLogin } from "../tray/autostart.js";
import { runningTray } from "../tray/instance.js";
import { addFolderMapping, removeFolderMapping } from "./folder.js";
import { hooksStatus, installHooks } from "./install.js";
import { CONFLICTS_DIR, syncSilently, type SyncResult } from "./sync.js";
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
    const conflicts = await glob("**/*", { cwd: CONFLICTS_DIR, nodir: true }).catch(() => []);
    return {
      ...(await loadDashboardState(current, maxFileSize)),
      syncing: !!syncing || (await isSyncRunning()),
      lastSync: await loadLastSync(),
      settings: {
        startAtLogin: await isAutostartEnabled(),
        hooks: await hooksStatus(),
        folders: Object.entries(current.folders ?? {}).map(([other, here]) => ({ other, here })),
        conflicts: conflicts.length,
        canCompact: current.backend === "git",
      },
    };
  };

  const requireConfig = async () => {
    const current = await loadConfig();
    if (!current) throw new HttpError(500, "Config missing");
    return current;
  };
  const text = (value: unknown, name: string) => {
    if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `Expected ${name}`);
    return value.trim();
  };

  // Each action changes something, then the page gets the new state, plus anything
  // the action returns
  type Action = (body: Record<string, unknown>) => Promise<Record<string, unknown> | void>;
  const actions = new Map<string, Action>([
    ["/api/selection", async ({ project, conversation, sync }) => {
      if (typeof project !== "string" || typeof sync !== "boolean") {
        throw new HttpError(400, "Expected { project, sync }");
      }
      if (conversation !== undefined && (typeof conversation !== "string" || !conversation.startsWith(`${project}/`))) {
        throw new HttpError(400, "The conversation must be in the project");
      }
      const current = await requireConfig();
      const selection = conversation
        ? selectConversation(current.selection ?? {}, conversation, sync)
        : selectProject(current.selection ?? {}, project, sync);
      await saveConfig({ ...current, selection });
    }],
    ["/api/sync", async () => ({ result: await sync() })],
    ["/api/startup", async ({ enabled }) => {
      if (typeof enabled !== "boolean") throw new HttpError(400, "Expected { enabled }");
      await setStartAtLogin(enabled);
    }],
    ["/api/hooks", () => installHooks()],
    // The page puts it on the clipboard without showing it
    ["/api/key", async () => ({ key: await exportKey() })],
    ["/api/folders/add", async ({ other, here }) => {
      const current = await requireConfig();
      await addFolderMapping(current, text(other, "other"), text(here, "here")).catch((error) => {
        throw new HttpError(400, errorMessage(error));
      });
    }],
    ["/api/folders/remove", async ({ other }) => {
      await removeFolderMapping(await requireConfig(), text(other, "other"));
    }],
    ["/api/conflicts/open", async () => {
      await fs.mkdir(CONFLICTS_DIR, { recursive: true });
      await openWithSystem(CONFLICTS_DIR);
    }],
  ]);

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

    const action = req.method === "POST" ? actions.get(pathname) : undefined;
    if (action) {
      const extra = await action(await readJson(req));
      return sendJson(res, 200, { ...(await state()), ...extra });
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
