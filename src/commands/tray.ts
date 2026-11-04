import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import readline from "readline";
import { homedir } from "os";
import { fileURLToPath } from "url";
import chalk from "chalk";
import type { Config } from "../backends/index.js";
import { loadConfig } from "../utils/config.js";
import { isSyncRunning } from "../utils/lock.js";
import { loadLastSync } from "../utils/manifest.js";
import { openApp } from "../utils/open.js";
import { disableAutostart, enableAutostart } from "../tray/autostart.js";
import { TRAY_UNSUPPORTED, trayHelper } from "../tray/helpers.js";
import { clearTrayInfo, runningTray, saveTrayInfo } from "../tray/instance.js";
import { trayStatus } from "../tray/status.js";
import { startDashboardServer } from "./dashboard.js";

const TRAY_DIR = path.join(homedir(), ".claude-sync", "tray");
const LOG_FILE = path.join(TRAY_DIR, "tray.log");
// Often enough to show a hook's sync while it runs, cheap enough to go unnoticed
const POLL_MS = 2000;

interface TrayOptions {
  /** Run in this process instead of starting a background one */
  foreground?: boolean;
  /** True with --startup, false with --no-startup */
  startup?: boolean;
}

const AREA =
  process.platform === "darwin" ? "menu bar" : process.platform === "win32" ? "notification area" : "system tray";

function log(message: string): Promise<void> {
  return fs
    .mkdir(TRAY_DIR, { recursive: true })
    .then(() => fs.appendFile(LOG_FILE, `${new Date().toISOString()} ${message}\n`))
    .catch(() => {});
}

/**
 * Show claude-sync in the notification area (menu bar on macOS): the icon shows
 * when a sync is running or needs attention, and opens the dashboard
 */
export async function tray(options: TrayOptions): Promise<void> {
  const config = await loadConfig();

  if (!config?.initialized) {
    console.log(chalk.red("Error: claude-sync not initialized. Run `claude-sync init` first."));
    process.exit(1);
  }

  if (options.startup === false) {
    const removed = await disableAutostart();
    console.log(removed ? "claude-sync won't start at login anymore." : "claude-sync wasn't set to start at login.");
    return;
  }

  const cli = fileURLToPath(new URL("../cli.js", import.meta.url));
  if (options.startup) {
    try {
      const file = await enableAutostart(process.execPath, cli);
      console.log(chalk.green(`✓ claude-sync will start at login (${file})`));
    } catch (error) {
      console.log(chalk.red(`Error: couldn't set up starting at login: ${(error as Error).message}`));
      process.exit(1);
    }
  }

  if (options.foreground) return runTray(config);

  if (await runningTray()) {
    console.log(`claude-sync is already in the ${AREA}.`);
    return;
  }
  // In the background, so the terminal (or the login item) can close
  spawn(process.execPath, [cli, "tray", "--foreground"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
  console.log(`claude-sync is now in the ${AREA}. Click its icon to open the dashboard.`);
}

async function runTray(config: Config): Promise<void> {
  // Starting at login and by hand at once shouldn't show two icons
  if (await runningTray()) return;

  const server = await startDashboardServer(config);
  await saveTrayInfo({ pid: process.pid, url: server.url });

  const helper = trayHelper(TRAY_DIR);
  await fs.mkdir(TRAY_DIR, { recursive: true });
  await fs.writeFile(helper.file, helper.script);
  const child = spawn(helper.command, helper.args, { stdio: "pipe", windowsHide: true });

  let timer: NodeJS.Timeout | undefined;
  let quitting = false;
  const quit = async (code = 0) => {
    if (quitting) return;
    quitting = true;
    clearInterval(timer);
    child.stdin.end();
    await clearTrayInfo(process.pid);
    process.exit(code);
  };

  child.on("error", (error) => {
    void log(`Couldn't start the tray icon (${helper.command}): ${error.message}`).then(() => quit(1));
  });
  child.on("exit", (code) => {
    if (quitting) return;
    const reason = code === TRAY_UNSUPPORTED ? "this desktop can't show tray icons" : `exit code ${code}`;
    void log(`The tray icon stopped: ${reason}`).then(() => quit(code === 0 ? 0 : 1));
  });
  child.stderr.on("data", (chunk) => void log(String(chunk).trim()));
  // The helper may be gone before a write reaches it
  child.stdin.on("error", () => {});

  let sent = "";
  const update = async () => {
    const status = trayStatus(server.isSyncing() || (await isSyncRunning()), await loadLastSync());
    const line = JSON.stringify(status);
    if (line === sent || !child.stdin.writable) return;
    child.stdin.write(`${line}\n`);
    sent = line;
  };

  readline.createInterface({ input: child.stdout }).on("line", (command) => {
    if (command === "open") {
      void openApp(server.url);
    } else if (command === "sync") {
      void server.sync().finally(update);
      void update();
    } else if (command === "quit") {
      void quit();
    }
  });

  timer = setInterval(() => void update(), POLL_MS);
  void update();

  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void quit());
}
