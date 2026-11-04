import { describe, it, expect } from "vitest";
import { storageConfig } from "../storage-setup.js";

describe("storageConfig", () => {
  it("builds each kind of storage like claude-sync init", () => {
    expect(storageConfig("git", { url: " https://github.com/sam/sessions.git " })).toEqual({
      backend: "git",
      backendConfig: { url: "https://github.com/sam/sessions.git" },
    });
    expect(storageConfig("gcs", { bucket: "b" }).backendConfig).toEqual({
      bucket: "b",
      endpoint: "https://storage.googleapis.com",
      region: "auto",
    });
    expect(storageConfig("r2", { bucket: "b", accountId: "abc" }).backendConfig.endpoint).toBe(
      "https://abc.r2.cloudflarestorage.com"
    );
    expect(storageConfig("s3", { bucket: "b" }).backendConfig.region).toBe("us-east-1");
  });

  it("names what's missing", () => {
    expect(() => storageConfig("git", {})).toThrow("Enter the repository URL");
    expect(() => storageConfig("r2", { bucket: "b" })).toThrow("Enter the Cloudflare account ID");
    expect(() => storageConfig("s3-custom", { bucket: "b" })).toThrow("Enter the endpoint URL");
  });
});
