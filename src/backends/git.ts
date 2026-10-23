import simpleGit, { CheckRepoActions, SimpleGit } from "simple-git";
import fs from "fs/promises";
import path from "path";
import { homedir } from "os";
import type { Backend, RemoteFile } from "./index.js";
import { assertEncrypted } from "../crypto/encrypt.js";

const SYNC_DIR = path.join(homedir(), ".claude-sync", "repo");
const FILES_DIR = "projects";
const BRANCH = "main";

function repoGit(): SimpleGit {
  // Fail instead of hanging a Claude Code hook on a credentials prompt
  return simpleGit(SYNC_DIR).env({ ...process.env, GIT_TERMINAL_PROMPT: "0" });
}

export async function initGitBackend(url: string): Promise<void> {
  await fs.mkdir(SYNC_DIR, { recursive: true });

  const git = repoGit();
  const isRepo = await git
    .checkIsRepo(CheckRepoActions.IS_REPO_ROOT)
    .catch(() => false);

  if (isRepo) {
    await git.remote(["set-url", "origin", url]);
  } else {
    await git.init();
    await git.addRemote("origin", url);
  }

  // Subagent transcripts under long project names can pass Windows' 260-char limit
  await git.addConfig("core.longpaths", "true");
  await git.addConfig("user.name", "claude-sync");
  await git.addConfig("user.email", "claude-sync@localhost");
  await git.raw(["symbolic-ref", "HEAD", `refs/heads/${BRANCH}`]);

  // Surface a wrong URL or missing credentials now rather than inside a hook
  await git.fetch("origin");
}

/**
 * Map each file under FILES_DIR at HEAD to its blob id
 */
async function listTree(git: SimpleGit): Promise<Map<string, string>> {
  const tree = await git.raw(["ls-tree", "-r", "-z", "HEAD", "--", FILES_DIR]);
  const files = new Map<string, string>();

  for (const entry of tree.split("\0")) {
    // "<mode> <type> <object>\t<path>"
    const [meta, filePath] = entry.split("\t");
    if (!filePath?.endsWith(".enc")) continue;
    files.set(filePath.slice(FILES_DIR.length + 1, -".enc".length), meta.split(" ")[2]);
  }

  return files;
}

export function createGitBackend(): Backend {
  const git = repoGit();
  const staged = new Set<string>();

  const filePath = (remotePath: string) =>
    path.join(SYNC_DIR, FILES_DIR, `${remotePath}.enc`);

  return {
    async list(): Promise<RemoteFile[]> {
      // The clone is only a cache: start from exactly what the remote has, dropping
      // anything left over from a run whose push failed
      await git.fetch("origin");
      const remoteHead = await git
        .raw(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${BRANCH}`])
        .catch(() => "");

      if (!remoteHead.trim()) return [];

      await git.raw(["reset", "--hard", `origin/${BRANCH}`]);
      await git.raw(["clean", "-fdq"]);

      const files = await listTree(git);
      return [...files].map(([p, version]) => ({ path: p, version }));
    },

    async get(remotePath: string): Promise<Buffer> {
      return fs.readFile(filePath(remotePath));
    },

    async put(remotePath: string, encryptedData: Buffer): Promise<void> {
      // Verify data is encrypted before writing
      assertEncrypted(encryptedData, remotePath);

      await fs.mkdir(path.dirname(filePath(remotePath)), { recursive: true });
      await fs.writeFile(filePath(remotePath), encryptedData);
      staged.add(remotePath);
    },

    async commit(message: string): Promise<Map<string, string>> {
      const versions = new Map<string, string>();
      if (staged.size === 0) return versions;

      await git.raw(["add", "-A", "--", FILES_DIR]);
      await git.commit(message);
      await git.push("origin", `HEAD:refs/heads/${BRANCH}`);

      const files = await listTree(git);
      for (const remotePath of staged) {
        const version = files.get(remotePath);
        if (version) versions.set(remotePath, version);
      }

      staged.clear();
      return versions;
    },
  };
}
