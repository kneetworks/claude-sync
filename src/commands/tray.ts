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
import { TRAY_ICONS } from "../tray/icons.js";
import { clearTrayInfo, runningTray, saveTrayInfo } from "../tray/instance.js";
import { trayStatus } from "../tray/status.js";
import { startDashboardServer } from "./dashboard.js";

const TRAY_DIR = path.join(homedir(), ".claude-sync", "tray");
const LOG_FILE = path.join(TRAY_DIR, "tray.log");
const CLI = fileURLToPath(new URL("../cli.js", import.meta.url));
// Often enough to show a hook's sync while it runs, cheap enough to go unnoticed
const POLL_MS = 2000;

interface TrayOptions {
  /** Run in this process instead of starting a background one */
  foreground?: boolean;
  /** True with --startup, false with --no-startup */
  startup?: boolean;
}

/** What this OS calls the place the icon goes */
export const TRAY_AREA =
  process.platform === "darwin" ? "menu bar" : process.platform === "win32" ? "notification area" : "system tray";

/**
 * False over SSH or on a Linux machine without a graphical session, where an icon
 * has nowhere to go
 */
export function hasDesktop(): boolean {
  if (process.platform === "win32") return true;
  if (process.platform === "darwin") return !process.env.SSH_CONNECTION;
  return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

/**
 * Start the icon in a background process, so the terminal (or the login item) can
 * close; false if it's already running
 */
export async function startTray(): Promise<boolean> {
  if (await runningTray()) return false;
  spawn(process.execPath, [CLI, "tray", "--foreground"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
  return true;
}

/**
 * Stop the running icon, and wait (up to 3 seconds) until it's gone
 */
async function stopTray(): Promise<void> {
  const running = await runningTray();
  if (!running) return;
  try {
    process.kill(running.pid);
  } catch {
    return;
  }
  for (let i = 0; i < 30 && (await runningTray()); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Start the icon at every login, and now. A running icon is restarted, since it may
 * be an older version than the one being installed.
 */
export async function setUpTray(): Promise<void> {
  await enableAutostart(process.execPath, CLI);
  await stopTray();
  await startTray();
}

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
  // Before setup, the icon offers it: its dashboard connects the storage
  const config = await loadConfig();

  if (options.startup === false) {
    const removed = await disableAutostart();
    console.log(removed ? "claude-sync won't start at login anymore." : "claude-sync wasn't set to start at login.");
    return;
  }

  if (options.startup) {
    try {
      const file = await enableAutostart(process.execPath, CLI);
      console.log(chalk.green(`✓ claude-sync will start at login (${file})`));
    } catch (error) {
      console.log(chalk.red(`Error: couldn't set up starting at login: ${(error as Error).message}`));
      process.exit(1);
    }
  }

  if (options.foreground) return runTray(config);

  if (await startTray()) {
    console.log(`claude-sync is now in the ${TRAY_AREA}. Click its icon to open the dashboard.`);
  } else {
    console.log(`claude-sync is already in the ${TRAY_AREA}.`);
  }
}

async function runTray(config: Config | null): Promise<void> {
  // Starting at login and by hand at once shouldn't show two icons
  if (await runningTray()) return;

  const server = await startDashboardServer(config, 0, { hostedByTray: true });
  await saveTrayInfo({ pid: process.pid, url: server.url });

  const helper = trayHelper(TRAY_DIR);
  await fs.mkdir(TRAY_DIR, { recursive: true });
  await fs.writeFile(helper.file, helper.script);
  // The helper loads the icon for each state from next to it
  const size = process.platform === "win32" ? 32 : 64;
  for (const [state, pngs] of Object.entries(TRAY_ICONS)) {
    await fs.writeFile(path.join(TRAY_DIR, `icon-${state}.png`), Buffer.from(pngs[size], "base64"));
  }
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
    const setUp = !!(await loadConfig())?.initialized;
    const status = trayStatus(server.isSyncing() || (await isSyncRunning()), await loadLastSync(), setUp);
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
