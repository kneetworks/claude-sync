import fs from "fs/promises";
import path from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";

const LOCK_FILE = path.join(homedir(), ".claude-sync", "sync.lock");

// A running sync keeps its lock fresh, however long it takes (a first push of a large
// history can take a while), so only a lock left by a run that died goes stale
const REFRESH_MS = 30 * 1000;
const STALE_MS = 2 * 60 * 1000;

/**
 * Take the sync lock so two Claude Code sessions starting together don't sync at once.
 * Returns a release function, or null if another sync holds the lock.
 */
export async function acquireLock(): Promise<(() => Promise<void>) | null> {
  await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true });
  // Releasing only removes the lock while it is still this one, not one another run
  // took over after this one was judged stale
  const owner = `${process.pid} ${randomBytes(8).toString("hex")}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.writeFile(LOCK_FILE, owner, { flag: "wx" });
      const keepFresh = setInterval(() => {
        const now = new Date();
        void fs.utimes(LOCK_FILE, now, now).catch(() => {});
      }, REFRESH_MS);
      keepFresh.unref();
      return async () => {
        clearInterval(keepFresh);
        if ((await fs.readFile(LOCK_FILE, "utf-8").catch(() => "")) === owner) {
          await fs.rm(LOCK_FILE, { force: true });
        }
      };
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
