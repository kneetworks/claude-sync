import { createGitBackend } from "./git.js";
import { createS3Backend, type S3Config } from "./s3.js";
import type { Selection } from "../utils/selection.js";

export interface RemoteFile {
  /** Portable path, e.g. "@home-Workspace-app/<session>.jsonl" */
  path: string;
  /** Changes whenever the stored ciphertext changes (git blob id, S3 ETag) */
  version: string;
  /** Size of the stored ciphertext in bytes */
  size?: number;
}

export interface Backend {
  /** Refresh from the remote and list every stored file */
  list(): Promise<RemoteFile[]>;
  get(path: string): Promise<Buffer>;
  /** Stage (git) or upload (S3) one encrypted file */
  put(path: string, encryptedData: Buffer): Promise<void>;
  /** Stage (git) or make (S3) the removal of one stored file */
  delete(path: string): Promise<void>;
  /** Publish everything put since list(); returns the new version of each put path */
  commit(message: string): Promise<Map<string, string>>;
  /** Largest encrypted file the storage accepts, if it has a limit */
  maxFileSize?: number;
  /**
   * Drop old versions, for storage that keeps them (git): the history becomes one
   * commit of the current files. Returns how many commits it had, and the size of
   * this machine's copy before and after.
   */
  compact?(): Promise<{ commits: number; before: number; after: number }>;
}

export interface Config {
  backend: "git" | "s3";
  backendConfig: Record<string, string>;
  initialized: boolean;
  createdAt: string;
  /** Folder on the other machines ("~/Workspace") -> where this machine keeps it */
  folders?: Record<string, string>;
  /** Projects and conversations this machine doesn't sync */
  selection?: Selection;
  /** False to stop the icon syncing conversations once they go quiet */
  syncWhenIdle?: boolean;
}

export async function getBackend(config: Config): Promise<Backend> {
  switch (config.backend) {
    case "git":
      return createGitBackend();
    case "s3":
      return createS3Backend(config.backendConfig as unknown as S3Config);
    default:
      throw new Error(`Unknown backend: ${config.backend}`);
  }
}
