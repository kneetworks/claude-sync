import { createGitBackend } from "./git.js";
import { createS3Backend, type S3Config } from "./s3.js";

export interface RemoteFile {
  /** Portable path, e.g. "@home-Workspace-app/<session>.jsonl" */
  path: string;
  /** Changes whenever the stored ciphertext changes (git blob id, S3 ETag) */
  version: string;
}

export interface Backend {
  /** Refresh from the remote and list every stored file */
  list(): Promise<RemoteFile[]>;
  get(path: string): Promise<Buffer>;
  /** Stage (git) or upload (S3) one encrypted file */
  put(path: string, encryptedData: Buffer): Promise<void>;
  /** Publish everything put since list(); returns the new version of each put path */
  commit(message: string): Promise<Map<string, string>>;
}

export interface Config {
  backend: "git" | "s3";
  backendConfig: Record<string, string>;
  initialized: boolean;
  createdAt: string;
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
