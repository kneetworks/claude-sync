import fs from "fs/promises";
import path from "path";
import { homedir } from "os";

const LOCK_FILE = path.join(homedir(), ".claude-sync", "sync.lock");

// A first push of a large history can take a while; older locks are from a crashed run
const STALE_MS = 15 * 60 * 1000;

/**
 * Take the sync lock so two Claude Code sessions starting together don't sync at once.
 * Returns a release function, or null if another sync holds the lock.
 */
export async function acquireLock(): Promise<(() => Promise<void>) | null> {
  await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.writeFile(LOCK_FILE, String(process.pid), { flag: "wx" });
      return () => fs.rm(LOCK_FILE, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      const stat = await fs.stat(LOCK_FILE).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs < STALE_MS) return null;
      await fs.rm(LOCK_FILE, { force: true });
    }
  }

  return null;
}

/**
 * True while a sync (possibly started by a Claude Code hook) holds the lock
 */
export async function isSyncRunning(): Promise<boolean> {
  const stat = await fs.stat(LOCK_FILE).catch(() => null);
  return !!stat && Date.now() - stat.mtimeMs < STALE_MS;
}
