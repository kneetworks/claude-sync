import fs from "fs/promises";
import path from "path";
import { homedir } from "os";

const MANIFEST_FILE = path.join(homedir(), ".claude-sync", "manifest.json");

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

export async function loadManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export async function saveManifest(manifest: Manifest): Promise<void> {
  await fs.mkdir(path.dirname(MANIFEST_FILE), { recursive: true });
  const tmp = `${MANIFEST_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(manifest));
  await fs.rename(tmp, MANIFEST_FILE);
}
