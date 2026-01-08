import simpleGit, { SimpleGit } from "simple-git";
import fs from "fs/promises";
import path from "path";
import { homedir } from "os";
import type { Backend, RemoteSession } from "./index.js";

const SYNC_DIR = path.join(homedir(), ".claude-sync", "repo");

export async function initGitBackend(url: string): Promise<void> {
  await fs.mkdir(SYNC_DIR, { recursive: true });

  const git: SimpleGit = simpleGit(SYNC_DIR);

  // Check if already initialized
  const isRepo = await git
    .checkIsRepo()
    .catch(() => false);

  if (isRepo) {
    // Verify remote matches
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    if (origin?.refs.fetch !== url) {
      await git.remote(["set-url", "origin", url]);
    }
    await git.pull("origin", "main").catch(() => {
      // Might be empty repo, that's fine
    });
  } else {
    // Clone or init
    try {
      await simpleGit().clone(url, SYNC_DIR);
    } catch {
      // Empty repo, init locally
      await git.init();
      await git.addRemote("origin", url);
    }
  }

  // Create sessions directory
  await fs.mkdir(path.join(SYNC_DIR, "sessions"), { recursive: true });
}

export function createGitBackend(): Backend {
  const git: SimpleGit = simpleGit(SYNC_DIR);

  return {
    async push(sessionId: string, encryptedData: Buffer): Promise<void> {
      const sessionPath = path.join(SYNC_DIR, "sessions", `${sessionId}.enc`);

      // Write encrypted data
      await fs.writeFile(sessionPath, encryptedData);

      // Commit and push
      await git.add(sessionPath);
      await git.commit(`sync: ${sessionId}`, { "--allow-empty": null });

      try {
        await git.push("origin", "main");
      } catch {
        // Might need to set upstream
        await git.push(["--set-upstream", "origin", "main"]);
      }
    },

    async pull(sessionId: string): Promise<Buffer> {
      // Pull latest
      await git.pull("origin", "main").catch(() => {
        // Might fail if nothing to pull
      });

      const sessionPath = path.join(SYNC_DIR, "sessions", `${sessionId}.enc`);
      return fs.readFile(sessionPath);
    },

    async list(): Promise<RemoteSession[]> {
      // Pull latest
      await git.pull("origin", "main").catch(() => {});

      const sessionsDir = path.join(SYNC_DIR, "sessions");

      try {
        const files = await fs.readdir(sessionsDir);
        return files
          .filter((f) => f.endsWith(".enc"))
          .map((f) => ({
            id: f.replace(".enc", ""),
            project: "unknown", // TODO: Store project metadata
            existsLocally: false, // TODO: Check local sessions
          }));
      } catch {
        return [];
      }
    },

    async delete(sessionId: string): Promise<void> {
      const sessionPath = path.join(SYNC_DIR, "sessions", `${sessionId}.enc`);

      await fs.unlink(sessionPath).catch(() => {});
      await git.add(sessionPath);
      await git.commit(`delete: ${sessionId}`);
      await git.push("origin", "main");
    },
  };
}
