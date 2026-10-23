import fs from "fs/promises";
import type { Stats } from "fs";
import path from "path";
import { homedir } from "os";
import ora from "ora";
import chalk from "chalk";
import { encrypt, decryptBuffer } from "../crypto/encrypt.js";
import { getBackend } from "../backends/index.js";
import { loadConfig } from "../utils/config.js";
import { loadManifest, saveManifest } from "../utils/manifest.js";
import { acquireLock } from "../utils/lock.js";
import { resolve, sha256 } from "../utils/merge.js";
import {
  belongsToSession,
  findLocalFiles,
  isSafeRemotePath,
  toLocalPath,
} from "../utils/sessions.js";

const CONFLICTS_DIR = path.join(homedir(), ".claude-sync", "conflicts");

interface SyncOptions {
  /** Also restore files deleted locally after they were synced */
  all?: boolean;
  /** Running from a Claude Code hook: quiet, and never fails the session */
  hook?: boolean;
}

interface HookInput {
  session_id?: string;
}

/**
 * Claude Code passes hook input as JSON on stdin
 */
async function readHookInput(): Promise<HookInput> {
  if (process.stdin.isTTY) return {};

  return new Promise((done) => {
    let data = "";
    const finish = () => {
      process.stdin.destroy();
      try {
        done(JSON.parse(data));
      } catch {
        done({});
      }
    };
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    setTimeout(finish, 2000).unref();
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readIfExists(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileAtomic(file: string, data: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.claude-sync-tmp`;
  await fs.writeFile(tmp, data);
  try {
    await fs.rename(tmp, file);
  } catch {
    // Windows refuses to replace a file another process holds open
    await fs.writeFile(file, data);
    await fs.rm(tmp, { force: true });
  }
}

async function saveConflict(remotePath: string, data: Buffer): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { dir, name, ext } = path.parse(path.join(CONFLICTS_DIR, ...remotePath.split("/")));
  const file = path.join(dir, `${name}.remote-${stamp}${ext}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, data);
  return file;
}

async function run(options: SyncOptions, push: boolean): Promise<void> {
  const config = await loadConfig();

  if (!config?.initialized) {
    // Not set up on this machine: stay out of the session's way
    if (options.hook) return;
    console.log(
      chalk.red("Error: claude-sync not initialized. Run `claude-sync init` first.")
    );
    process.exit(1);
  }

  const hookInput = options.hook ? await readHookInput() : {};
  const release = await acquireLock();

  if (!release) {
    if (!options.hook) console.log(chalk.yellow("Another sync is running; try again shortly."));
    return;
  }

  const spinner = options.hook ? null : ora("Fetching remote...").start();
  const progress = (text: string) => {
    if (spinner) spinner.text = text;
  };
  const warnings: string[] = [];
  let pulled = 0;
  let pushed = 0;

  try {
    const backend = await getBackend(config);
    const manifest = await loadManifest();
    const remoteFiles = await backend.list();
    const remoteVersions = new Map(remoteFiles.map((f) => [f.path, f.version]));

    // Claude Code may already have loaded, and be appending to, the current session
    const isLive = (remotePath: string) =>
      !!hookInput.session_id && belongsToSession(remotePath, hookInput.session_id);

    // Pull: bring in remote changes without overwriting unsynced local work
    for (const [i, file] of remoteFiles.entries()) {
      progress(`Checking remote ${i + 1}/${remoteFiles.length}...`);

      if (!isSafeRemotePath(file.path)) {
        warnings.push(`Skipped unsafe remote path: ${file.path}`);
        continue;
      }
      if (isLive(file.path)) continue;

      const entry = manifest[file.path];
      const localPath = toLocalPath(file.path);
      const restoreMissing =
        options.all && !(await fs.access(localPath).then(() => true, () => false));
      if (entry?.v === file.version && !restoreMissing) continue;

      // One unwritable file (e.g. a path too long for this machine) shouldn't stop
      // the rest; it stays out of the manifest so the next sync retries it
      try {
        const remote = await decryptBuffer(await backend.get(file.path));
        const resolution = resolve(await readIfExists(localPath), remote, entry?.h);

        if (resolution === "take-remote") {
          await writeFileAtomic(localPath, remote);
          pulled++;
        } else if (resolution === "conflict") {
          const saved = await saveConflict(file.path, remote);
          warnings.push(`Conflict on ${file.path}: kept the local copy, remote copy saved to ${saved}`);
        }

        // Recording the local stat marks the file as matching this remote version
        const inSync = resolution === "take-remote" || resolution === "same";
        const stat = inSync ? await fs.stat(localPath) : null;
        manifest[file.path] = {
          v: file.version,
          h: sha256(remote),
          size: stat?.size,
          mtime: stat?.mtimeMs,
        };
      } catch (error) {
        warnings.push(`Couldn't pull ${file.path}: ${errorMessage(error)}`);
      }
    }

    await saveManifest(manifest);

    // Push: upload local files that changed since they were last synced
    if (push) {
      const localFiles = await findLocalFiles();
      const pending = new Map<string, { h: string; size: number; mtime: number }>();

      for (const [i, file] of localFiles.entries()) {
        progress(`Checking local ${i + 1}/${localFiles.length}...`);

        const entry = manifest[file.remotePath];
        let stat: Stats;
        let data: Buffer;
        try {
          stat = await fs.stat(file.absPath);
          if (entry && entry.size === stat.size && entry.mtime === stat.mtimeMs) continue;
          data = await fs.readFile(file.absPath);
        } catch (error) {
          // Claude Code may have removed or renamed it since it was listed
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            warnings.push(`Couldn't read ${file.remotePath}: ${errorMessage(error)}`);
          }
          continue;
        }

        const hash = sha256(data);
        const local = { h: hash, size: stat.size, mtime: stat.mtimeMs };

        if (entry?.h === hash) {
          // Touched but unchanged: remember the stat so it isn't hashed again
          manifest[file.remotePath] = { ...entry, ...local };
          continue;
        }

        // Pull skipped this file (live session) but the remote copy has moved on
        const remoteVersion = remoteVersions.get(file.remotePath);
        if (remoteVersion && remoteVersion !== entry?.v) {
          const remote = await decryptBuffer(await backend.get(file.remotePath));
          const resolution = resolve(data, remote, entry?.h);

          if (resolution === "same") {
            manifest[file.remotePath] = { v: remoteVersion, ...local };
            continue;
          }
          // Remote extends this copy; a later sync pulls it once the session is closed
          if (resolution === "take-remote") continue;
          if (resolution === "conflict") {
            const saved = await saveConflict(file.remotePath, remote);
            warnings.push(`Conflict on ${file.remotePath}: pushed the local copy, remote copy saved to ${saved}`);
          }
        }

        progress(`Encrypting ${pending.size + 1}: ${file.remotePath}`);
        await backend.put(file.remotePath, await encrypt(data));
        pending.set(file.remotePath, local);
      }

      if (pending.size > 0) {
        progress(`Pushing ${pending.size} file(s)...`);
        const versions = await backend.commit(`sync: ${pending.size} file(s)`);

        for (const [remotePath, local] of pending) {
          const version = versions.get(remotePath);
          if (version) manifest[remotePath] = { v: version, ...local };
        }
        pushed = pending.size;
      }

      await saveManifest(manifest);
    }

    spinner?.succeed(
      push ? `Pulled ${pulled}, pushed ${pushed} file(s)` : `Pulled ${pulled} file(s)`
    );
    for (const warning of warnings) console.error(chalk.yellow(`⚠ ${warning}`));
  } catch (error) {
    const message = errorMessage(error);
    if (options.hook) {
      console.error(`claude-sync: ${message}`);
    } else {
      spinner?.fail(`Sync failed: ${message}`);
      process.exitCode = 1;
    }
  } finally {
    await release();
  }
}

/**
 * Pull remote changes, then push local ones. Always pulling first means a push
 * never overwrites changes made on another machine.
 */
export async function sync(options: SyncOptions): Promise<void> {
  await run(options, true);
}

export async function pull(options: SyncOptions): Promise<void> {
  await run(options, false);
}
