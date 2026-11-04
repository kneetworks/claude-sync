import fs from "fs/promises";
import { homedir, hostname } from "os";
import type { Config } from "../backends/index.js";
import { ENCRYPTION_OVERHEAD } from "../crypto/encrypt.js";
import { loadManifest, loadRemoteIndex } from "./manifest.js";
import { isSelected } from "./selection.js";
import {
  encodeProjectDir,
  findLocalFiles,
  isSafeRemotePath,
  toFolderMappings,
  toLocalProject,
} from "./sessions.js";

/**
 * How a file or conversation stands on this machine, most urgent first:
 * - too-big: over the storage's size limit, so it can't be uploaded
 * - upload: changed here since the last sync
 * - download: the storage has a copy this machine hasn't pulled yet
 * - synced: matches the storage as of the last sync
 * - skipped: on this machine, but unchecked
 * - online: only in the storage (unchecked, or removed here after it synced)
 */
export const SYNC_STATES = ["too-big", "upload", "download", "synced", "skipped", "online"] as const;
export type SyncState = (typeof SYNC_STATES)[number];

export interface ConversationInfo {
  /** "<project>/<session id>" */
  key: string;
  title?: string;
  /** Bytes on this machine, or in the storage for files only stored there */
  size: number;
  /** Last change on this machine (ms since epoch) */
  modified?: number;
  /** When its latest message was written, if its transcript is on this machine */
  lastMessage?: number;
  sync: boolean;
  state: SyncState;
}

export interface ProjectInfo {
  /** Portable name, e.g. "@home-code-app" */
  name: string;
  /** Folder name to show, e.g. "app" */
  label: string;
  /** Where the project is on this machine, as recorded in its transcripts */
  path?: string;
  /** The project's own setting, which new conversations follow */
  sync: boolean;
  size: number;
  modified?: number;
  state: SyncState;
  conversations: ConversationInfo[];
  /** Memory and other files that aren't part of one conversation */
  otherFiles: { count: number; size: number; state: SyncState } | null;
}

export interface DashboardState {
  machine: string;
  storage: string;
  /** A web page for the storage, if it has one */
  storageLink: string | null;
  /** When the storage was last listed, by any sync */
  listedAt?: number;
  projects: ProjectInfo[];
}

export interface TranscriptSummary {
  title?: string;
  /** When the latest message seen was written (ms since epoch) */
  lastMessage?: number;
  /** Working directories recorded in the transcript, latest first */
  cwds: string[];
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Titles can be appended anywhere in a transcript, which can be tens of MB, so
// only its start (first prompt, folder) and end (latest title) are read
const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 256 * 1024;

type TranscriptRecord = Record<string, unknown>;

function parseRecords(lines: string[]): TranscriptRecord[] {
  const records: TranscriptRecord[] = [];
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      if (record && typeof record === "object" && !Array.isArray(record)) records.push(record);
    } catch {
      // A line cut off at the edge of a read
    }
  }
  return records;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

interface Prompt {
  text: string;
  /** A slash command ("/review the diff") rather than something typed to Claude */
  command: boolean;
}

function prompts(record: TranscriptRecord): Prompt[] {
  if (record.type !== "user" || record.isMeta || record.isSidechain) return [];
  const content = (record.message as { content?: unknown } | undefined)?.content;
  const parts = Array.isArray(content)
    ? content.filter((part) => part?.type === "text").map((part) => part.text)
    : [content];

  return parts.flatMap((part): Prompt[] => {
    const prompt = text(part);
    if (!prompt) return [];

    const name = /<command-name>([^<]*)<\/command-name>/.exec(prompt)?.[1];
    if (name) {
      const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(prompt)?.[1] ?? "";
      return [{ text: `${name} ${args}`, command: true }];
    }
    // Command output and injected context also come wrapped in tags
    return prompt.trimStart().startsWith("<") ? [] : [{ text: prompt, command: false }];
  });
}

function oneLine(value: string, max = 120): string {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Title a conversation the way /resume does: the name given with /rename, else
 * Claude Code's generated title, else the first prompt (or slash command)
 */
export function summarizeTranscript(head: string[], tail: string[]): TranscriptSummary {
  const first = parseRecords(head);
  const records = [...first, ...parseRecords(tail)];
  const typed = first.flatMap(prompts);
  const latest = (pick: (record: TranscriptRecord) => unknown) => {
    for (let i = records.length - 1; i >= 0; i--) {
      const value = text(pick(records[i]));
      if (value) return value;
    }
    return undefined;
  };

  const title =
    latest((r) => r.type === "custom-title" && r.customTitle) ??
    latest((r) => r.type === "ai-title" && r.aiTitle) ??
    typed.find((p) => !p.command)?.text ??
    latest((r) => r.type === "last-prompt" && r.lastPrompt) ??
    typed[0]?.text;

  const times = records
    .filter((r) => r.type === "user" || r.type === "assistant")
    .map((r) => Date.parse(String(r.timestamp)))
    .filter((time) => !Number.isNaN(time));

  return {
    title: title && oneLine(title),
    lastMessage: times.length > 0 ? Math.max(...times) : undefined,
    cwds: [...new Set(records.flatMap((r) => text(r.cwd) ?? []).reverse())],
  };
}

async function readTranscriptSummary(file: string, size: number): Promise<TranscriptSummary> {
  const handle = await fs.open(file, "r");
  try {
    const read = async (position: number, length: number) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      return buffer.subarray(0, bytesRead).toString("utf-8").split("\n");
    };
    const tailStart = Math.max(HEAD_BYTES, size - TAIL_BYTES);
    return summarizeTranscript(
      await read(0, Math.min(size, HEAD_BYTES)),
      size > tailStart ? await read(tailStart, size - tailStart) : []
    );
  } finally {
    await handle.close();
  }
}

// The dashboard refreshes often; only re-read transcripts that changed
const summaries = new Map<string, { size: number; mtime: number; summary: TranscriptSummary }>();

async function summarize(file: string, size: number, mtime: number): Promise<TranscriptSummary> {
  const cached = summaries.get(file);
  if (cached?.size === size && cached.mtime === mtime) return cached.summary;

  const summary = await readTranscriptSummary(file, size).catch(() => ({ cwds: [] }));
  summaries.set(file, { size, mtime, summary });
  return summary;
}

interface FileInfo {
  remotePath: string;
  absPath?: string;
  size: number;
  mtime?: number;
  state: SyncState;
}

const baseName = (folder: string) => folder.split(/[\\/]/).filter(Boolean).pop() ?? folder;

/**
 * Name a project from the folders its transcripts were recorded in. A folder only
 * counts as this machine's path if Claude Code would store the project under this
 * folder name: transcripts pulled from another machine, or a session that moved
 * into a worktree, record other folders.
 */
export function nameProject(
  portable: string,
  localDir: string,
  cwds: string[]
): { label: string; path?: string } {
  const dir = localDir.toLowerCase();
  const path = cwds.find((cwd) => encodeProjectDir(cwd).toLowerCase() === dir);
  if (path) return { label: baseName(path), path };

  // Another machine's folder still names the project if the folder names agree
  const elsewhere = cwds.find((cwd) =>
    dir.endsWith(`-${encodeProjectDir(baseName(cwd)).toLowerCase()}`)
  );
  return { label: elsewhere ? baseName(elsewhere) : portable.replace(/^@home-/, "") };
}

function mostUrgent(states: SyncState[]): SyncState {
  return SYNC_STATES.find((s) => states.includes(s)) ?? "synced";
}

function sum(files: FileInfo[]): number {
  return files.reduce((total, f) => total + f.size, 0);
}

function latestChange(files: FileInfo[]): number | undefined {
  const times = files.flatMap((f) => (f.mtime === undefined ? [] : [f.mtime]));
  return times.length > 0 ? Math.max(...times) : undefined;
}

/**
 * Every project and conversation on this machine or in the storage (as of the last
 * sync), with what syncing does with it here
 */
export async function loadDashboardState(
  config: Config,
  maxFileSize = Infinity
): Promise<DashboardState> {
  const home = homedir();
  const folders = toFolderMappings(config.folders);
  const [localFiles, manifest, remoteIndex] = await Promise.all([
    findLocalFiles(home, folders),
    loadManifest(),
    loadRemoteIndex(),
  ]);
  const stored = remoteIndex?.files ?? {};
  const maxSize = maxFileSize - ENCRYPTION_OVERHEAD;
  const files: FileInfo[] = [];

  for (const { remotePath, absPath } of localFiles) {
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat) continue;

    const entry = manifest[remotePath];
    let state: SyncState;
    if (!isSelected(remotePath, config.selection)) state = "skipped";
    else if (stat.size > maxSize) state = "too-big";
    else if (entry?.size !== stat.size || entry?.mtime !== stat.mtimeMs) state = "upload";
    else if (stored[remotePath] && stored[remotePath].v !== entry.v) state = "download";
    else state = "synced";

    files.push({ remotePath, absPath, size: stat.size, mtime: stat.mtimeMs, state });
  }

  const local = new Set(localFiles.map((f) => f.remotePath));
  for (const [remotePath, { v, size = 0 }] of Object.entries(stored)) {
    if (local.has(remotePath) || !isSafeRemotePath(remotePath)) continue;
    // Pull doesn't bring back a file this machine already had and then removed
    const pulledBefore = manifest[remotePath]?.v === v;
    const state =
      isSelected(remotePath, config.selection) && !pulledBefore ? "download" : "online";
    files.push({ remotePath, size: Math.max(0, size - ENCRYPTION_OVERHEAD), state });
  }

  // project -> session id (or null for memory and other files) -> files
  const groups = new Map<string, Map<string | null, FileInfo[]>>();
  for (const file of files) {
    const [project, entry] = file.remotePath.split("/");
    const id = entry.replace(/\.jsonl$/, "");
    const group = SESSION_ID.test(id) ? id : null;

    if (!groups.has(project)) groups.set(project, new Map());
    const sessions = groups.get(project)!;
    if (!sessions.has(group)) sessions.set(group, []);
    sessions.get(group)!.push(file);
  }

  const projects: ProjectInfo[] = [];
  for (const [name, sessions] of groups) {
    const conversations: ConversationInfo[] = [];
    const cwds: { cwd: string; at: number }[] = [];

    for (const [id, group] of sessions) {
      if (id === null) continue;
      const key = `${name}/${id}`;
      const transcript = group.find((f) => f.remotePath === `${key}.jsonl` && f.absPath);
      const summary = transcript
        ? await summarize(transcript.absPath!, transcript.size, transcript.mtime!)
        : { cwds: [] };
      const modified = latestChange(group);
      cwds.push(...summary.cwds.map((cwd) => ({ cwd, at: modified ?? 0 })));

      conversations.push({
        key,
        title: summary.title,
        size: sum(group),
        modified,
        lastMessage: summary.lastMessage,
        sync: isSelected(`${key}.jsonl`, config.selection),
        state: mostUrgent(group.map((f) => f.state)),
      });
    }

    conversations.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
    const other = sessions.get(null) ?? [];
    const all = [...sessions.values()].flat();

    // The newest conversations know best where the project is now
    const recorded = cwds.sort((a, b) => b.at - a.at).map((c) => c.cwd);
    const localDir = toLocalProject(name, home, folders);

    projects.push({
      name,
      ...nameProject(name, localDir, recorded),
      sync: config.selection?.projects?.[name] ?? true,
      size: sum(all),
      modified: latestChange(all),
      state: mostUrgent(all.map((f) => f.state)),
      conversations,
      otherFiles:
        other.length > 0
          ? { count: other.length, size: sum(other), state: mostUrgent(other.map((f) => f.state)) }
          : null,
    });
  }

  projects.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));

  const storage =
    config.backend === "git"
      ? // Never show credentials embedded in the URL
        (config.backendConfig.url ?? "").replace(/\/\/[^@/]+@/, "//")
      : `s3://${config.backendConfig.bucket}`;

  return {
    machine: hostname(),
    storage,
    storageLink: storageLink(config),
    listedAt: remoteIndex?.listedAt,
    projects,
  };
}

/**
 * A web page for the storage, if there is one: the repository on its git host, or
 * the S3 console for an AWS bucket
 */
export function storageLink(config: Pick<Config, "backend" | "backendConfig">): string | null {
  const { url, bucket, endpoint } = config.backendConfig;
  if (config.backend === "git") {
    // git@host:owner/repo.git or ssh://git@host/owner/repo.git
    const ssh = /^(?:ssh:\/\/)?[^@\s/]+@([^:/\s]+)[:/](.+?)(?:\.git)?\/?$/.exec(url ?? "");
    if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
    // https://[user@]host/owner/repo.git, without any credentials in it
    const web = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url ?? "");
    return web ? `https://${web[1]}/${web[2]}` : null;
  }
  return bucket && !endpoint ? `https://s3.console.aws.amazon.com/s3/buckets/${encodeURIComponent(bucket)}` : null;
}
