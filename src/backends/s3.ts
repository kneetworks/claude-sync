import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { Backend, RemoteFile } from "./index.js";
import { assertEncrypted } from "../crypto/encrypt.js";

export interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string; // For GCS, R2, MinIO, etc.
  accessKeyId?: string;
  secretAccessKey?: string;
  prefix?: string; // Optional prefix for all keys
}

export function createS3Backend(config: S3Config): Backend {
  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region: config.region || "us-east-1",
  };

  // Custom endpoint for GCS, R2, MinIO, etc.
  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
    clientConfig.forcePathStyle = true; // Required for most S3-compatible services
  }

  // Explicit credentials (optional - can use env vars or IAM roles)
  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  const client = new S3Client(clientConfig);
  const prefix = `${config.prefix ? `${config.prefix}/` : ""}projects/`;
  const uploaded = new Map<string, string>();

  function getKey(remotePath: string): string {
    return `${prefix}${remotePath}.enc`;
  }

  return {
    async list(): Promise<RemoteFile[]> {
      const files: RemoteFile[] = [];
      let continuationToken: string | undefined;

      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );

        for (const obj of response.Contents || []) {
          if (obj.Key?.endsWith(".enc") && obj.ETag) {
            files.push({
              path: obj.Key.slice(prefix.length, -".enc".length),
              version: obj.ETag,
              size: obj.Size,
            });
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return files;
    },

    async get(remotePath: string): Promise<Buffer> {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: getKey(remotePath),
        })
      );

      if (!response.Body) {
        throw new Error(`${remotePath} not found`);
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },

    async put(remotePath: string, encryptedData: Buffer): Promise<void> {
      // Verify data is encrypted before uploading
      assertEncrypted(encryptedData, remotePath);

      const response = await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: getKey(remotePath),
          Body: encryptedData,
          ContentType: "application/octet-stream",
        })
      );

      if (response.ETag) uploaded.set(remotePath, response.ETag);
    },

    async commit(): Promise<Map<string, string>> {
      // Uploads are already live; just hand back their versions
      const versions = new Map(uploaded);
      uploaded.clear();
      return versions;
    },
  };
}
