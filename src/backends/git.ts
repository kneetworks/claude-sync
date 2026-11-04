import simpleGit, { CheckRepoActions, SimpleGit } from "simple-git";
import { spawn } from "child_process";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { homedir, tmpdir } from "os";
import type { Backend, RemoteFile, StorageSettings } from "./index.js";
import { assertEncrypted } from "../crypto/encrypt.js";

const SYNC_DIR = path.join(homedir(), ".claude-sync", "repo");
const FILES_DIR = "projects";
// Beside FILES_DIR, so versions that only read FILES_DIR ignore it
const SETTINGS_FILE = "settings.json";
const BRANCH = "main";
const REMOTE_HEAD = `refs/remotes/origin/${BRANCH}`;
// The first commit of the storage history when this machine's copy last dropped its
// old versions: it changes whenever any machine trims or compacts the history
const CLEANED_ROOT = "claude-sync.cleanedroot";
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
 * Run git in the clone with `input` on stdin, returning its output as bytes, which
 * simple-git can't do
 */
function gitBytes(args: string[], input = ""): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", SYNC_DIR, ...args], { windowsHide: true });
    const output: Buffer[] = [];
    let errors = "";
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk) => (errors += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(output)) : reject(new Error(`git ${args[0]}: ${errors.trim()}`))
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

interface HistoryCommit {
  id: string;
  /** Commit time, ms */
  time: number;
}

/**
 * The remote branch's commits, oldest first
 */
async function history(git: SimpleGit, head: string): Promise<HistoryCommit[]> {
  const log = await git.raw(["log", "--first-parent", "--reverse", "--format=%H %ct", head]);
  return log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, time] = line.split(" ");
      return { id, time: Number(time) * 1000 };
    });
}

/**
 * Where a history kept since `keepSince` starts: the last commit made by then, whose
 * files were still current at that time. 0 when there's nothing older to drop.
 */
function firstKept(commits: HistoryCommit[], keepSince: number): number {
  for (let i = commits.length - 1; i > 0; i--) {
    if (commits[i].time <= keepSince) return i;
  }
  return 0;
}

/**
 * A commit object's text with `parent` as its only parent, or none, and without a
 * signature, which wouldn't match anymore
 */
function reparent(commit: string, parent: string): string {
  const split = commit.indexOf("\n\n");
  const headers = (split === -1 ? commit : commit.slice(0, split)).split("\n");
  const kept: string[] = [];
  let dropping = false;
  for (const line of headers) {
    // A line starting with a space continues the header above it
    if (!line.startsWith(" ")) dropping = line.startsWith("parent ") || line.startsWith("gpgsig");
    if (!dropping) kept.push(line);
  }
  if (parent) kept.splice(1, 0, `parent ${parent}`);
  return kept.join("\n") + (split === -1 ? "" : commit.slice(split));
}

/**
 * Write `commits` again as a history of their own, starting at the first: the same
 * files, authors, dates and messages. Keeping the dates is what lets the next trim
 * tell which versions are old, and commit-tree only takes dates from the environment,
 * which simple-git guards, so the commits are written as objects. Returns the last.
 */
async function rewrite(commits: string[]): Promise<string> {
  const format = (await gitBytes(["rev-parse", "--show-object-format"])).toString().trim();
  const algorithm = format === "sha256" ? "sha256" : "sha1";
  // "<id> commit <size>\n<object>\n" for each
  const batch = await gitBytes(["cat-file", "--batch"], commits.join("\n") + "\n");
  const dir = await fs.mkdtemp(path.join(tmpdir(), "claude-sync-history-"));
  try {
    const files: string[] = [];
    const ids: string[] = [];
    let parent = "";
    let offset = 0;
    for (const [i, id] of commits.entries()) {
      const newline = batch.indexOf(0x0a, offset);
      const size = Number(batch.subarray(offset, newline).toString().split(" ")[2]);
      if (!Number.isInteger(size)) throw new Error(`Couldn't read commit ${id}`);
      // latin1 keeps every byte as it is
      const object = reparent(batch.subarray(newline + 1, newline + 1 + size).toString("latin1"), parent);
      offset = newline + 1 + size + 1;
      parent = createHash(algorithm).update(`commit ${object.length}\0`).update(object, "latin1").digest("hex");
      ids.push(parent);
      files.push(path.join(dir, String(i)));
      await fs.writeFile(files[i], object, "latin1");
    }
    const written = (await gitBytes(["hash-object", "-t", "commit", "-w", "--stdin-paths"], files.join("\n") + "\n"))
      .toString()
      .split("\n")
      .filter(Boolean);
    if (written.join() !== ids.join()) throw new Error("The rewritten history doesn't match what git stored");
    return parent;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
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
  // As of the last fetch
  const remoteHead = async () =>
    (await git.raw(["rev-parse", "--verify", "--quiet", REMOTE_HEAD]).catch(() => "")).trim();
  const rootCommit = async () =>
    (await git.raw(["rev-list", "--max-parents=0", REMOTE_HEAD]).catch(() => "")).trim().split("\n")[0];
  const cleanedRoot = async () =>
    (await git.raw(["config", "--get", CLEANED_ROOT]).catch(() => "")).trim();

  return {
    maxFileSize: MAX_FILE_SIZE,

    async list(): Promise<RemoteFile[]> {
      // The clone is only a cache: start from exactly what the remote has, dropping
      // anything left over from a run whose push failed
      await git.fetch("origin");
      if (!(await remoteHead())) return [];

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

    async compact(keepSince?: number) {
      const before = await folderSize(path.join(SYNC_DIR, ".git"));
      await git.fetch("origin");
      const head = await remoteHead();
      const commits = head ? await history(git, head) : [];

      // Encrypted files are stored by content, so other machines already have every
      // file in the new history
      let rewritten = "";
      if (keepSince === undefined && commits.length > 1) {
        // A commit with the same files and no parents
        const tree = (await git.raw(["rev-parse", `${head}^{tree}`])).trim();
        rewritten = (await git.raw(["commit-tree", tree, "-m", "compact: keep only the current files"])).trim();
      } else if (keepSince !== undefined) {
        const first = firstKept(commits, keepSince);
        if (first > 0) rewritten = await rewrite(commits.slice(first).map((commit) => commit.id));
      }
      if (rewritten) {
        // Refused if another machine pushed since the fetch, so nothing of theirs is lost
        await git.raw(["push", `--force-with-lease=${BRANCH}:${head}`, "origin", `${rewritten}:refs/heads/${BRANCH}`]);
        await git.fetch("origin");
        await git.raw(["reset", "--hard", `origin/${BRANCH}`]);
      }

      // Drop the old versions from this machine's copy too, whichever machine dropped
      // them from the storage
      const root = await rootCommit();
      if (keepSince === undefined || root !== (await cleanedRoot())) {
        await git.raw(["reflog", "expire", "--expire=now", "--all"]);
        await git.raw(["gc", "--prune=now", "--quiet"]);
        if (root) await git.addConfig(CLEANED_ROOT, root);
      }
      return { commits: commits.length, before, after: await folderSize(path.join(SYNC_DIR, ".git")) };
    },

    async hasOldVersions(keepSince: number) {
      const head = await remoteHead();
      if (!head) return false;
      if (firstKept(await history(git, head), keepSince) > 0) return true;
      return (await rootCommit()) !== (await cleanedRoot());
    },

    async readSettings(): Promise<StorageSettings> {
      const text = await git.raw(["show", `${REMOTE_HEAD}:${SETTINGS_FILE}`]).catch(() => "");
      try {
        const settings = JSON.parse(text);
        return settings && typeof settings === "object" ? settings : {};
      } catch {
        return {};
      }
    },

    async writeSettings(settings: StorageSettings) {
      await fs.writeFile(path.join(SYNC_DIR, SETTINGS_FILE), `${JSON.stringify(settings, null, 2)}\n`);
      await git.raw(["add", "--", SETTINGS_FILE]);
      if (!(await git.raw(["diff", "--cached", "--name-only"])).trim()) return;
      await git.commit("settings: update");
      await git.push("origin", `HEAD:refs/heads/${BRANCH}`);
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
