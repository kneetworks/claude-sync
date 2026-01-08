import { createGitBackend } from "./git.js";

export interface RemoteSession {
  id: string;
  project: string;
  existsLocally: boolean;
}

export interface Backend {
  push(sessionId: string, encryptedData: Buffer): Promise<void>;
  pushBatch(sessions: Array<{ id: string; data: Buffer }>, onProgress?: (done: number, total: number) => void): Promise<{ pushed: number; failed: number }>;
  pull(sessionId: string): Promise<Buffer>;
  list(): Promise<RemoteSession[]>;
  delete(sessionId: string): Promise<void>;
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
      // TODO: Implement S3 backend
      throw new Error("S3 backend not yet implemented");
    default:
      throw new Error(`Unknown backend: ${config.backend}`);
  }
}
