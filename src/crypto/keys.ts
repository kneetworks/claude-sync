import fs from "fs/promises";
import path from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";

const CONFIG_DIR = path.join(homedir(), ".claude-sync");
const KEY_FILE = path.join(CONFIG_DIR, "key");

/**
 * Generate a new 256-bit encryption key
 */
export async function generateKey(): Promise<Buffer> {
  return randomBytes(32);
}

/**
 * Save the encryption key to disk
 */
export async function saveKey(key: Buffer): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(KEY_FILE, key, { mode: 0o600 });
}

/**
 * Load the encryption key from disk
 */
export async function loadKey(): Promise<Buffer> {
  try {
    return await fs.readFile(KEY_FILE);
  } catch {
    throw new Error(
      "Encryption key not found. Run `claude-sync init` to generate one."
    );
  }
}

/**
 * Check if an encryption key exists
 */
export async function keyExists(): Promise<boolean> {
  try {
    await fs.access(KEY_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Export key as base64 for backup
 */
export async function exportKey(): Promise<string> {
  const key = await loadKey();
  return key.toString("base64");
}

/**
 * Import key from base64 backup
 */
export async function importKey(base64Key: string): Promise<void> {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("Invalid key length. Expected 256-bit key.");
  }
  await saveKey(key);
}
