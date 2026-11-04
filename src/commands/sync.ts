import fs from "fs/promises";
import type { Stats } from "fs";
import path from "path";
import { homedir } from "os";
import ora from "ora";
import chalk from "chalk";
import { encrypt, decryptBuffer, ENCRYPTION_OVERHEAD } from "../crypto/encrypt.js";
import { getBackend, type Backend, type Config, type StorageSettings } from "../backends/index.js";
import { loadConfig } from "../utils/config.js";
import {
  loadManifest,
  loadRemoteIndex,
  saveLastSync,
  saveManifest,
  saveRemoteIndex,
  type RemoteIndex,
} from "../utils/manifest.js";
import { acquireLock } from "../utils/lock.js";
import {
  isLineMerged,
  isTranscript,
  mergeLines,
  pickTranscript,
  resolve,
  sha256,
} from "../utils/merge.js";
import { conversationKey, isSelected } from "../utils/selection.js";
import {
  belongsToSession,
  findLocalFiles,
  isSafeRemotePath,
  toFolderMappings,
  toLocalPath,
  type FolderMapping,
} from "../utils/sessions.js";

export const CONFLICTS_DIR = path.join(homedir(), ".claude-sync", "conflicts");

interface SyncOptions {
  /** Also restore files deleted locally after they were synced */
  all?: boolean;
  /** Restore these conversations ("<project>/<session id>") the same way */
  restore?: string[];
  /** Running from a Claude Code hook: quiet, and never fails the session */
  hook?: boolean;
  /** Print nothing and leave reporting to the caller (the dashboard) */
  silent?: boolean;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  warnings: string[];
  /** Another sync held the lock, so this one didn't run */
  busy?: boolean;
  error?: string;
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

/**
 * Download and decrypt one remote file. Failing to decrypt means this machine has a
 * different key, which is fatal: pushing on regardless would mix keys in the storage.
 */
async function fetchRemote(backend: Backend, remotePath: string): Promise<Buffer> {
  const encrypted = await backend.get(remotePath);
  try {
    return await decryptBuffer(encrypted);
  } catch {
    throw new Error(
      `Can't decrypt ${remotePath}: this machine's key doesn't match the one it was ` +
        "pushed with. Import the key from your other machine: claude-sync key import <base64>"
    );
  }
}

async function saveConflict(
  remotePath: string,
  data: Buffer,
  side: "remote" | "local" = "remote"
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { dir, name, ext } = path.parse(path.join(CONFLICTS_DIR, ...remotePath.split("/")));
  const file = path.join(dir, `${name}.${side}-${stamp}${ext}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, data);
  return file;
}

async function run(options: SyncOptions, push: boolean): Promise<SyncResult> {
  const config = await loadConfig();
  const quiet = options.hook || options.silent;

  if (!config?.initialized) {
    const error = "claude-sync not initialized. Run `claude-sync init` first.";
    // Not set up on this machine: stay out of the session's way
    if (quiet) return { pulled: 0, pushed: 0, warnings: [], error };
    console.log(chalk.red(`Error: ${error}`));
    process.exit(1);
  }

  const hookInput = options.hook ? await readHookInput() : {};
  const release = await acquireLock();

  if (!release) {
    if (!quiet) console.log(chalk.yellow("Another sync is running; try again shortly."));
    return { pulled: 0, pushed: 0, warnings: [], busy: true };
  }

  const spinner = quiet ? null : ora("Fetching remote...").start();
  const progress = (text: string) => {
    if (spinner) spinner.text = text;
  };
  const warnings: string[] = [];
  let pulled = 0;
  let pushed = 0;
  let error: string | undefined;

  try {
    const backend = await getBackend(config);
    const folders = toFolderMappings(config.folders);
    const manifest = await loadManifest();
    const remoteFiles = await backend.list();
    const remoteVersions = new Map(remoteFiles.map((f) => [f.path, f.version]));

    const remoteIndex: RemoteIndex = {
      listedAt: Date.now(),
      files: Object.fromEntries(remoteFiles.map((f) => [f.path, { v: f.version, size: f.size }])),
    };
    await saveRemoteIndex(remoteIndex);

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
      if (!isSelected(file.path, config.selection)) continue;

      const entry = manifest[file.path];
      const localPath = toLocalPath(file.path, homedir(), folders);
      const restore = options.all || !!options.restore?.includes(conversationKey(file.path));
      const restoreMissing =
        restore && !(await fs.access(localPath).then(() => true, () => false));
      if (entry?.v === file.version && !restoreMissing) continue;

      const remote = await fetchRemote(backend, file.path);

      // One unwritable file (e.g. a path too long for this machine) shouldn't stop
      // the rest; it stays out of the manifest so the next sync retries it
      try {
        const local = await readIfExists(localPath);
        const resolution = resolve(local, remote, entry?.h);
        let inSync = resolution === "take-remote" || resolution === "same";

        if (resolution === "take-remote") {
          await writeFileAtomic(localPath, remote);
          pulled++;
        } else if (resolution === "conflict" && local && isLineMerged(file.path)) {
          // Left out of sync with the remote, so the push below uploads the merge
          await writeFileAtomic(localPath, mergeLines(local, remote));
          pulled++;
        } else if (resolution === "conflict" && local && isTranscript(file.path)) {
          // Continue from the most recent message; if the local copy wins, the push
          // below uploads it
          const { take, keepOther } = pickTranscript(local, remote);
          if (keepOther) {
            const [other, side] = take === "remote" ? [local, "local" as const] : [remote, "remote" as const];
            const saved = await saveConflict(file.path, other, side);
            warnings.push(`Conflict on ${file.path}: kept the copy with the latest message, the ${side} copy is saved to ${saved}`);
          }
          if (take === "remote") {
            await writeFileAtomic(localPath, remote);
            pulled++;
            inSync = true;
          }
        } else if (resolution === "conflict") {
          const saved = await saveConflict(file.path, remote);
          warnings.push(`Conflict on ${file.path}: kept the local copy, remote copy saved to ${saved}`);
        }

        // Recording the local stat marks the file as matching this remote version
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
      const localFiles = await findLocalFiles(homedir(), folders);
      const pending = new Map<string, { h: string; size: number; mtime: number }>();
      const encryptedSizes = new Map<string, number>();
      // One file the storage refuses would otherwise fail the whole push
      const maxSize = (backend.maxFileSize ?? Infinity) - ENCRYPTION_OVERHEAD;

      for (const [i, file] of localFiles.entries()) {
        progress(`Checking local ${i + 1}/${localFiles.length}...`);
        if (!isSelected(file.remotePath, config.selection)) continue;

        const entry = manifest[file.remotePath];
        let stat: Stats;
        let data: Buffer;
        try {
          stat = await fs.stat(file.absPath);
          if (entry && entry.size === stat.size && entry.mtime === stat.mtimeMs) continue;
          if (stat.size > maxSize) {
            const mb = Math.round(stat.size / 1_000_000);
            warnings.push(`Skipped ${file.remotePath}: ${mb} MB is too big for this storage`);
            continue;
          }
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
          const remote = await fetchRemote(backend, file.remotePath);
          const resolution = resolve(data, remote, entry?.h);

          if (resolution === "same") {
            manifest[file.remotePath] = { v: remoteVersion, ...local };
            continue;
          }
          // Remote extends this copy; a later sync pulls it once the session is closed
          if (resolution === "take-remote") continue;
          if (resolution === "conflict" && isTranscript(file.remotePath)) {
            const { take, keepOther } = pickTranscript(data, remote);
            // The conversation went on elsewhere and this copy only gained bookkeeping
            // (typically a window left open here, now closing): don't upload it over
            // the newer one, which a later sync pulls once the session is closed
            if (take === "remote") continue;
            if (keepOther) {
              const saved = await saveConflict(file.remotePath, remote);
              warnings.push(`Conflict on ${file.remotePath}: pushed the copy with the latest message, remote copy saved to ${saved}`);
            }
          } else if (resolution === "conflict") {
            const saved = await saveConflict(file.remotePath, remote);
            warnings.push(`Conflict on ${file.remotePath}: pushed the local copy, remote copy saved to ${saved}`);
          }
        }

        progress(`Encrypting ${pending.size + 1}: ${file.remotePath}`);
        const encrypted = await encrypt(data);
        await backend.put(file.remotePath, encrypted);
        pending.set(file.remotePath, local);
        encryptedSizes.set(file.remotePath, encrypted.length);
      }

      if (pending.size > 0) {
        progress(`Pushing ${pending.size} file(s)...`);
        const versions = await backend.commit(`sync: ${pending.size} file(s)`);

        for (const [remotePath, local] of pending) {
          const version = versions.get(remotePath);
          if (!version) continue;
          manifest[remotePath] = { v: version, ...local };
          remoteIndex.files[remotePath] = { v: version, size: encryptedSizes.get(remotePath) };
        }
        pushed = pending.size;
        await saveRemoteIndex(remoteIndex);
      }

      await saveManifest(manifest);
    }

    spinner?.succeed(
      push ? `Pulled ${pulled}, pushed ${pushed} file(s)` : `Pulled ${pulled} file(s)`
    );
    if (!options.silent) {
      for (const warning of warnings) console.error(chalk.yellow(`⚠ ${warning}`));
    }
  } catch (caught) {
    error = errorMessage(caught);
    if (options.hook) {
      console.error(`claude-sync: ${error}`);
    } else if (!options.silent) {
      spinner?.fail(`Sync failed: ${error}`);
      process.exitCode = 1;
    }
  } finally {
    // For the dashboard and tray icon, which don't see syncs run by hooks
    await saveLastSync({ at: Date.now(), pulled, pushed, warnings, error }).catch(() => {});
    await release();
  }

  return { pulled, pushed, warnings, error };
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

/**
 * Sync without printing anything, for the dashboard's "Sync now"
 */
export function syncSilently(restore?: string[]): Promise<SyncResult> {
  return run({ silent: true, restore }, true);
}

/**
 * When the newest change that hasn't synced yet was written (ms since the epoch), or
 * 0 when everything this machine syncs is up to date. Reads only file stats, so the
 * icon can check it often.
 */
export async function lastUnsyncedChange(config: Config): Promise<number> {
  const manifest = await loadManifest();
  let newest = 0;
  for (const file of await findLocalFiles(homedir(), toFolderMappings(config.folders))) {
    if (!isSelected(file.remotePath, config.selection)) continue;
    const stat = await fs.stat(file.absPath).catch(() => null);
    const entry = manifest[file.remotePath];
    if (!stat || (entry && entry.size === stat.size && entry.mtime === stat.mtimeMs)) continue;
    newest = Math.max(newest, stat.mtimeMs);
  }
  return newest;
}

export interface CompactResult {
  /** Commits the storage history had */
  commits: number;
  /** Size of this machine's copy of the storage before and after, in bytes */
  before: number;
  after: number;
  busy?: boolean;
  error?: string;
}

const DAY = 86_400_000;
/** How many days of old versions the storage can be set to keep */
export const HISTORY_CHOICES = [1, 3, 7, 30];
/** Days of old versions the storage keeps until someone chooses */
export const DEFAULT_HISTORY_DAYS = 7;

/**
 * Days of old versions the storage keeps, the same for every machine; null keeps
 * them all
 */
export function historyDays(settings: StorageSettings): number | null {
  return settings.keepHistoryDays === undefined ? DEFAULT_HISTORY_DAYS : settings.keepHistoryDays;
}

const keepSince = (days: number | null) => (days === null ? 0 : Date.now() - days * DAY);

/**
 * Drop the old versions the storage keeps (git only), there and in this machine's
 * copy; other machines' copies drop them when they trim their history. With
 * `keepHistory`, only versions older than the storage's history setting go.
 */
export async function compactStorage(keepHistory = false): Promise<CompactResult> {
  const none = { commits: 0, before: 0, after: 0 };
  const config = await loadConfig();
  if (!config?.initialized) return { ...none, error: "claude-sync not initialized" };
  const release = await acquireLock();
  if (!release) return { ...none, busy: true };

  try {
    const backend = await getBackend(config);
    if (!backend.compact) return { ...none, error: "This storage doesn't keep old versions" };
    if (!keepHistory) return await backend.compact();
    await backend.list();
    return await backend.compact(keepSince(historyDays((await backend.readSettings?.()) ?? {})));
  } catch (caught) {
    return { ...none, error: errorMessage(caught) };
  } finally {
    await release();
  }
}

/**
 * True when the storage, or this machine's copy of it, has versions older than the
 * history it keeps. A day's grace has the icon trim about once a day, not hourly.
 */
export async function historyTrimDue(config: Config): Promise<boolean> {
  const backend = await getBackend(config);
  if (!backend.hasOldVersions || !backend.readSettings) return false;
  const days = historyDays(await backend.readSettings());
  return backend.hasOldVersions(keepSince(days === null ? null : days + 1));
}

/**
 * The settings every machine shares, as of the last sync; null for storage that has
 * none (buckets, which keep no history)
 */
export async function loadStorageSettings(config: Config): Promise<StorageSettings | null> {
  const backend = await getBackend(config);
  return backend.readSettings ? backend.readSettings() : null;
}

/**
 * Change the settings every machine shares
 */
export async function updateStorageSettings(change: StorageSettings): Promise<void> {
  const config = await loadConfig();
  if (!config?.initialized) throw new Error("claude-sync not initialized");
  const backend = await getBackend(config);
  if (!backend.readSettings || !backend.writeSettings) throw new Error("This storage has no shared settings");
  const release = await acquireLock();
  if (!release) throw new Error("A sync is running; try again in a moment");
  try {
    await backend.list();
    await backend.writeSettings({ ...(await backend.readSettings()), ...change });
  } finally {
    await release();
  }
}

export interface DeleteResult {
  deleted: number;
  /** Another sync held the lock, so nothing was deleted */
  busy?: boolean;
  error?: string;
}

/**
 * Conversations whose every file on this machine is in the storage, unchanged since
 * it synced, so removing them here loses nothing
 */
async function storedConversations(keys: Set<string>, folders: FolderMapping[]): Promise<Set<string>> {
  const manifest = await loadManifest();
  const stored = (await loadRemoteIndex())?.files ?? {};
  const unsafe = new Set<string>();

  for (const file of await findLocalFiles(homedir(), folders)) {
    const key = conversationKey(file.remotePath);
    if (!keys.has(key)) continue;
    const entry = manifest[file.remotePath];
    const stat = await fs.stat(file.absPath).catch(() => null);
    const synced = entry && stored[file.remotePath] && stat && entry.size === stat.size && entry.mtime === stat.mtimeMs;
    if (!synced) unsafe.add(key);
  }
  return new Set([...keys].filter((key) => !unsafe.has(key)));
}

/**
 * Delete conversations ("<project>/<session id>") from this machine, and from the
 * storage too unless `fromStorage` is false.
 *
 * Removed from this machine only, a conversation stays in the storage and its
 * manifest entries stay, so sync doesn't bring it back but Download (restore) does;
 * only conversations entirely in the storage are removed that way. Deleted from the
 * storage too, other machines keep their own copies, since deletions don't sync, and
 * don't upload them again unless the conversation goes on there.
 */
export async function deleteConversations(keys: string[], fromStorage = true): Promise<DeleteResult> {
  const config = await loadConfig();
  if (!config?.initialized) return { deleted: 0, error: "claude-sync not initialized" };
  const release = await acquireLock();
  if (!release) return { deleted: 0, busy: true };

  const folders = toFolderMappings(config.folders);
  const wanted = new Set(keys);
  const removed = new Set<string>();
  try {
    const removable = fromStorage ? wanted : await storedConversations(wanted, folders);

    // This machine first: if a file can't be deleted (Claude Code may have it open),
    // its stored copy is kept too
    for (const key of removable) {
      try {
        await fs.rm(toLocalPath(`${key}.jsonl`, homedir(), folders), { force: true });
        await fs.rm(toLocalPath(key, homedir(), folders), { recursive: true, force: true });
        removed.add(key);
      } catch {
        // Counted below
      }
    }
    const unsynced = wanted.size - removable.size;
    const open = removable.size - removed.size;
    const notes = [
      unsynced ? `${unsynced} weren't removed because they have changes that aren't in your storage yet` : "",
      open ? `${open} couldn't be deleted on this computer; close them in Claude Code first` : "",
    ].filter(Boolean);
    const keptNote = notes.length ? notes.join("; ") : undefined;
    if (!fromStorage || removed.size === 0) return { deleted: removed.size, error: keptNote };

    const backend = await getBackend(config);
    for (const file of await backend.list()) {
      if (removed.has(conversationKey(file.path))) await backend.delete(file.path);
    }
    await backend.commit(`delete: ${removed.size} conversation(s)`);

    // Forgotten only now: had the storage refused, the manifest would still keep the
    // next sync from bringing back what was deleted here
    const manifest = await loadManifest();
    const index = await loadRemoteIndex();
    for (const remotePath of Object.keys(manifest)) {
      if (removed.has(conversationKey(remotePath))) delete manifest[remotePath];
    }
    for (const remotePath of Object.keys(index?.files ?? {})) {
      if (removed.has(conversationKey(remotePath))) delete index!.files[remotePath];
    }
    await saveManifest(manifest);
    if (index) await saveRemoteIndex(index);

    return { deleted: removed.size, error: keptNote };
  } catch (caught) {
    return {
      deleted: 0,
      error: `Deleted on this computer, but not from your storage: ${errorMessage(caught)}`,
    };
  } finally {
    await release();
  }
}
