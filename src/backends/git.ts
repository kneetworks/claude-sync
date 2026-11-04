import simpleGit, { CheckRepoActions, SimpleGit } from "simple-git";
import fs from "fs/promises";
import path from "path";
import { homedir } from "os";
import type { Backend, RemoteFile } from "./index.js";
import { assertEncrypted } from "../crypto/encrypt.js";

const SYNC_DIR = path.join(homedir(), ".claude-sync", "repo");
const FILES_DIR = "projects";
const BRANCH = "main";
// GitHub rejects a push containing any file over 100 MB
const MAX_FILE_SIZE = 100_000_000;

function repoGit(): SimpleGit {
  // Fail instead of hanging a Claude Code hook on a credentials prompt. Set here rather
  // than with .env(), since simple-git refuses an environment holding variables such
  // as GIT_ASKPASS or EDITOR, which editors' terminals and many users set.
  process.env.GIT_TERMINAL_PROMPT = "0";
  return simpleGit({
    baseDir: SYNC_DIR,
    // After a fetch, git's automatic housekeeping repacks the whole history, and on
    // Windows it can't run in the background, so it held hooks up for minutes. The
    // clone is only a cache, and encrypted files don't compress, so skip it.
    config: ["maintenance.auto=false", "gc.auto=0"],
  });
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

async function folderSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? await folderSize(full) : (await fs.stat(full).catch(() => null))?.size ?? 0;
  }
  return total;
}

/**
 * Map each file under FILES_DIR at HEAD to its blob id and size
 */
async function listTree(git: SimpleGit): Promise<Map<string, { version: string; size: number }>> {
  const tree = await git.raw(["ls-tree", "-r", "-l", "-z", "HEAD", "--", FILES_DIR]);
  const files = new Map<string, { version: string; size: number }>();

  for (const entry of tree.split("\0")) {
    // "<mode> <type> <object> <size>\t<path>", the size padded with spaces
    const [meta, filePath] = entry.split("\t");
    if (!filePath?.endsWith(".enc")) continue;
    const [, , version, size] = meta.split(/\s+/);
    files.set(filePath.slice(FILES_DIR.length + 1, -".enc".length), {
      version,
      size: Number(size),
    });
  }

  return files;
}

export function createGitBackend(): Backend {
  const git = repoGit();
  const staged = new Set<string>();

  const filePath = (remotePath: string) =>
    path.join(SYNC_DIR, FILES_DIR, `${remotePath}.enc`);

  return {
    maxFileSize: MAX_FILE_SIZE,

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
      return [...files].map(([p, file]) => ({ path: p, ...file }));
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

    async compact() {
      const before = await folderSize(path.join(SYNC_DIR, ".git"));
      await git.fetch("origin");
      const head = (
        await git.raw(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${BRANCH}`]).catch(() => "")
      ).trim();
      const commits = head ? Number((await git.raw(["rev-list", "--count", head])).trim()) : 0;

      if (commits > 1) {
        // A commit with the same files and no parents. Encrypted files are stored by
        // content, so other machines already have every file in it.
        const tree = (await git.raw(["rev-parse", `${head}^{tree}`])).trim();
        const commit = (await git.raw(["commit-tree", tree, "-m", "compact: keep only the current files"])).trim();
        // Refused if another machine pushed since the fetch, so nothing of theirs is lost
        await git.raw(["push", `--force-with-lease=${BRANCH}:${head}`, "origin", `${commit}:refs/heads/${BRANCH}`]);
        await git.fetch("origin");
        await git.raw(["reset", "--hard", `origin/${BRANCH}`]);
      }

      // Drop the old versions from this machine's copy too
      await git.raw(["reflog", "expire", "--expire=now", "--all"]);
      await git.raw(["gc", "--prune=now", "--quiet"]);
      return { commits, before, after: await folderSize(path.join(SYNC_DIR, ".git")) };
    },

    async delete(remotePath: string): Promise<void> {
      // commit() stages every change under FILES_DIR, removals included
      await fs.rm(filePath(remotePath), { force: true });
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
        const version = files.get(remotePath)?.version;
        if (version) versions.set(remotePath, version);
      }

      staged.clear();
      return versions;
    },
  };
}
