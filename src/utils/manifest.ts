import fs from "fs/promises";
import path from "path";
import { homedir } from "os";

const MANIFEST_FILE = path.join(homedir(), ".claude-sync", "manifest.json");
const REMOTE_FILE = path.join(homedir(), ".claude-sync", "remote.json");

/**
 * What this machine last synced for one remote path
 */
export interface ManifestEntry {
  /** Backend version of the remote file (git blob id or S3 ETag) */
  v: string;
  /** sha256 of that version's plaintext */
  h: string;
  /** Size and mtime of the local file when it last held that plaintext */
  size?: number;
  mtime?: number;
}

export type Manifest = Record<string, ManifestEntry>;

/**
 * What the storage held at the last sync, so the dashboard can show files this
 * machine doesn't have without going online
 */
export interface RemoteIndex {
  /** When the storage was listed (ms since epoch) */
  listedAt: number;
  files: Record<string, { v: string; size?: number }>;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return null;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

export async function loadManifest(): Promise<Manifest> {
  return (await readJson<Manifest>(MANIFEST_FILE)) ?? {};
}

export async function saveManifest(manifest: Manifest): Promise<void> {
  await writeJson(MANIFEST_FILE, manifest);
}

export async function loadRemoteIndex(): Promise<RemoteIndex | null> {
  return readJson<RemoteIndex>(REMOTE_FILE);
}

export async function saveRemoteIndex(index: RemoteIndex): Promise<void> {
  await writeJson(REMOTE_FILE, index);
}
