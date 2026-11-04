import fs from "fs/promises";
import path from "path";
import { homedir } from "os";

const TRAY_FILE = path.join(homedir(), ".claude-sync", "tray.json");

/**
 * The tray icon process and its dashboard link (which carries the access token,
 * so the file is only readable by this user)
 */
export interface TrayInfo {
  pid: number;
  url: string;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // The process exists but belongs to someone else
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readTrayInfo(): Promise<TrayInfo | null> {
  try {
    return JSON.parse(await fs.readFile(TRAY_FILE, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * The tray icon already running for this user, other than this process
 */
export async function runningTray(): Promise<TrayInfo | null> {
  const info = await readTrayInfo();
  return info && info.pid !== process.pid && isAlive(info.pid) ? info : null;
}

export async function saveTrayInfo(info: TrayInfo): Promise<void> {
  await fs.mkdir(path.dirname(TRAY_FILE), { recursive: true });
  await fs.writeFile(TRAY_FILE, JSON.stringify(info), { mode: 0o600 });
}

export async function clearTrayInfo(pid: number): Promise<void> {
  if ((await readTrayInfo())?.pid === pid) await fs.rm(TRAY_FILE, { force: true });
}
