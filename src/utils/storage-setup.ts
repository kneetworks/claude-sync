import { generateKey, importKey, keyExists, loadKey, saveKey } from "../crypto/keys.js";
import { decryptWithKey } from "../crypto/encrypt.js";
import { initGitBackend } from "../backends/git.js";
import { getBackend, type Backend, type Config, type RemoteFile } from "../backends/index.js";
import { loadConfig, saveConfig } from "./config.js";

/** The kinds of storage setup offers, like `claude-sync init` */
export const STORAGE_KINDS = ["git", "s3", "gcs", "r2", "s3-custom"] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

export const S3_ENDPOINTS = {
  gcs: "https://storage.googleapis.com",
  r2: "https://{account_id}.r2.cloudflarestorage.com", // {account_id} is the user's
};

export interface StorageFields {
  url?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  accountId?: string;
}

type Storage = Pick<Config, "backend" | "backendConfig">;

/**
 * The config for a kind of storage; throws naming what's missing
 */
export function storageConfig(kind: StorageKind, fields: StorageFields): Storage {
  const need = (value: string | undefined, what: string) => {
    const trimmed = value?.trim();
    if (!trimmed) throw new Error(`Enter the ${what}`);
    return trimmed;
  };
  const region = fields.region?.trim() || "us-east-1";

  switch (kind) {
    case "git":
      return { backend: "git", backendConfig: { url: need(fields.url, "repository URL") } };
    case "s3":
      return { backend: "s3", backendConfig: { bucket: need(fields.bucket, "bucket name"), region } };
    case "gcs":
      return {
        backend: "s3",
        backendConfig: { bucket: need(fields.bucket, "bucket name"), endpoint: S3_ENDPOINTS.gcs, region: "auto" },
      };
    case "r2":
      return {
        backend: "s3",
        backendConfig: {
          bucket: need(fields.bucket, "bucket name"),
          endpoint: S3_ENDPOINTS.r2.replace("{account_id}", need(fields.accountId, "Cloudflare account ID")),
          region: "auto",
        },
      };
    case "s3-custom":
      return {
        backend: "s3",
        backendConfig: { bucket: need(fields.bucket, "bucket name"), endpoint: need(fields.endpoint, "endpoint URL"), region },
      };
  }
}

/**
 * True if a pasted key can decrypt a sample from the storage, else what's wrong with it
 */
export function checkKey(input: string, sample: Buffer): true | string {
  const key = Buffer.from(input.trim(), "base64");
  if (key.length !== 32) return "That isn't a 256-bit key in base64";
  try {
    decryptWithKey(sample, key);
    return true;
  } catch {
    return "That key can't read the sessions in this storage";
  }
}

/**
 * The smallest stored file, to check a key against without downloading much
 */
export async function sampleOf(remote: Backend, files: RemoteFile[]): Promise<Buffer> {
  const smallest = files.reduce((a, b) => ((b.size ?? Infinity) < (a.size ?? Infinity) ? b : a));
  return remote.get(smallest.path);
}

/**
 * Reach a storage and list it; for git this clones it, and fails on a wrong URL or
 * missing credentials
 */
export async function openStorage(storage: Storage): Promise<{ remote: Backend; files: RemoteFile[] }> {
  if (storage.backend === "git") await initGitBackend(storage.backendConfig.url);
  const remote = await getBackend({ ...storage, initialized: true, createdAt: "" });
  return { remote, files: await remote.list() };
}

async function save(storage: Storage): Promise<void> {
  await saveConfig({ ...(await loadConfig()), ...storage, initialized: true, createdAt: new Date().toISOString() });
}

/** A storage that already has conversations, waiting for the key they were encrypted with */
export interface PendingStorage extends Storage {
  /** The smallest stored file, base64, to check the key against */
  sample: string;
}

export type Connection =
  /** The storage was empty: a key was made (or this machine's kept), worth backing up */
  | { step: "new" }
  /** This machine's key reads the storage's conversations */
  | { step: "joined" }
  /** The storage has conversations: provideKey() with their key finishes connecting */
  | { step: "key"; pending: PendingStorage };

/**
 * Connect this machine to a storage, as `claude-sync init` does. A key is never
 * replaced: everything already pushed with it would become unreadable.
 */
export async function connectStorage(kind: StorageKind, fields: StorageFields): Promise<Connection> {
  const storage = storageConfig(kind, fields);
  const { remote, files } = await openStorage(storage);

  if (files.length === 0) {
    if (!(await keyExists())) await saveKey(await generateKey());
    await save(storage);
    return { step: "new" };
  }

  const sample = await sampleOf(remote, files);
  if (await keyExists()) {
    if (checkKey((await loadKey()).toString("base64"), sample) !== true) {
      throw new Error("This computer already has an encryption key, and it can't read the conversations in that storage");
    }
    await save(storage);
    return { step: "joined" };
  }
  return { step: "key", pending: { ...storage, sample: sample.toString("base64") } };
}

/**
 * Finish connecting to a storage that has conversations, with their key
 */
export async function provideKey(pending: PendingStorage, key: string): Promise<void> {
  const check = checkKey(key, Buffer.from(pending.sample, "base64"));
  if (check !== true) throw new Error(check);
  await importKey(key.trim());
  await save({ backend: pending.backend, backendConfig: pending.backendConfig });
}
