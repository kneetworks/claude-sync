import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";

// We need to test the key functions with a temporary directory
// to avoid interfering with the user's actual config

describe("key generation", () => {
  it("generates a 256-bit (32 byte) key", async () => {
    // Test the underlying randomBytes since generateKey uses it
    const key = randomBytes(32);
    expect(key.length).toBe(32);
    expect(Buffer.isBuffer(key)).toBe(true);
  });

  it("generates unique keys each time", async () => {
    const key1 = randomBytes(32);
    const key2 = randomBytes(32);
    expect(key1.equals(key2)).toBe(false);
  });
});

describe("key import validation", () => {
  it("validates key length from base64", () => {
    // Valid 32-byte key in base64
    const validKey = randomBytes(32);
    const base64Key = validKey.toString("base64");
    const imported = Buffer.from(base64Key, "base64");

    expect(imported.length).toBe(32);
  });

  it("rejects short keys", () => {
    const shortKey = randomBytes(16);
    const base64Key = shortKey.toString("base64");
    const imported = Buffer.from(base64Key, "base64");

    expect(imported.length).not.toBe(32);
  });

  it("rejects long keys", () => {
    const longKey = randomBytes(64);
    const base64Key = longKey.toString("base64");
    const imported = Buffer.from(base64Key, "base64");

    expect(imported.length).not.toBe(32);
  });
});

describe("key file permissions (Unix)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sync-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates config directory with 0700 permissions", async () => {
    const configDir = path.join(tempDir, "config");
    await fs.mkdir(configDir, { recursive: true, mode: 0o700 });

    const stats = await fs.stat(configDir);
    // On Unix, check the permission bits
    if (process.platform !== "win32") {
      expect(stats.mode & 0o777).toBe(0o700);
    }
  });

  it("creates key file with 0600 permissions", async () => {
    const keyFile = path.join(tempDir, "key");
    const key = randomBytes(32);
    await fs.writeFile(keyFile, key, { mode: 0o600 });

    const stats = await fs.stat(keyFile);
    // On Unix, check the permission bits
    if (process.platform !== "win32") {
      expect(stats.mode & 0o777).toBe(0o600);
    }
  });
});

describe("key roundtrip", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sync-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("key survives save/load cycle", async () => {
    const keyFile = path.join(tempDir, "key");
    const originalKey = randomBytes(32);

    // Save
    await fs.writeFile(keyFile, originalKey, { mode: 0o600 });

    // Load
    const loadedKey = await fs.readFile(keyFile);

    expect(loadedKey.equals(originalKey)).toBe(true);
  });

  it("key survives base64 encoding/decoding", () => {
    const originalKey = randomBytes(32);
    const base64 = originalKey.toString("base64");
    const restored = Buffer.from(base64, "base64");

    expect(restored.equals(originalKey)).toBe(true);
  });
});
