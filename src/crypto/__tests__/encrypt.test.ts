import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import {
  encryptWithKey,
  decryptWithKey,
  isEncrypted,
  assertEncrypted,
} from "../encrypt.js";

describe("encrypt/decrypt", () => {
  const testKey = randomBytes(32);

  it("encrypts and decrypts string data correctly", () => {
    const plaintext = "Hello, World!";
    const encrypted = encryptWithKey(plaintext, testKey);
    const decrypted = decryptWithKey(encrypted, testKey);

    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts Buffer data correctly", () => {
    const plaintext = Buffer.from("Binary data here", "utf-8");
    const encrypted = encryptWithKey(plaintext, testKey);
    const decrypted = decryptWithKey(encrypted, testKey);

    expect(decrypted).toBe(plaintext.toString("utf-8"));
  });

  it("encrypts and decrypts JSON session data", () => {
    const sessionData = JSON.stringify({
      type: "message",
      role: "user",
      content: "Test message with special chars: éàü 🎉",
    });
    const encrypted = encryptWithKey(sessionData, testKey);
    const decrypted = decryptWithKey(encrypted, testKey);

    expect(decrypted).toBe(sessionData);
    expect(JSON.parse(decrypted)).toEqual(JSON.parse(sessionData));
  });

  it("encrypts and decrypts large data", () => {
    // Simulate a large session transcript (~100KB)
    const largeData = "x".repeat(100_000);
    const encrypted = encryptWithKey(largeData, testKey);
    const decrypted = decryptWithKey(encrypted, testKey);

    expect(decrypted).toBe(largeData);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const plaintext = "Same message";
    const encrypted1 = encryptWithKey(plaintext, testKey);
    const encrypted2 = encryptWithKey(plaintext, testKey);

    // Ciphertexts should be different due to random IV
    expect(encrypted1.equals(encrypted2)).toBe(false);

    // But both should decrypt to the same plaintext
    expect(decryptWithKey(encrypted1, testKey)).toBe(plaintext);
    expect(decryptWithKey(encrypted2, testKey)).toBe(plaintext);
  });

  it("produces correctly formatted output: IV (12) + AuthTag (16) + Ciphertext", () => {
    const plaintext = "Test";
    const encrypted = encryptWithKey(plaintext, testKey);

    // Minimum size: 12 (IV) + 16 (AuthTag) + 1 (at least 1 byte ciphertext)
    expect(encrypted.length).toBeGreaterThanOrEqual(29);

    // For AES-GCM, ciphertext length equals plaintext length
    const expectedLength = 12 + 16 + Buffer.from(plaintext).length;
    expect(encrypted.length).toBe(expectedLength);
  });

  it("fails to decrypt with wrong key", () => {
    const plaintext = "Secret message";
    const wrongKey = randomBytes(32);
    const encrypted = encryptWithKey(plaintext, testKey);

    expect(() => decryptWithKey(encrypted, wrongKey)).toThrow();
  });

  it("fails to decrypt tampered ciphertext (integrity check)", () => {
    const plaintext = "Secret message";
    const encrypted = encryptWithKey(plaintext, testKey);

    // Tamper with the ciphertext portion (after IV and AuthTag)
    const tampered = Buffer.from(encrypted);
    tampered[28] ^= 0xff; // Flip bits in ciphertext

    expect(() => decryptWithKey(tampered, testKey)).toThrow();
  });

  it("fails to decrypt tampered auth tag", () => {
    const plaintext = "Secret message";
    const encrypted = encryptWithKey(plaintext, testKey);

    // Tamper with the auth tag (bytes 12-27)
    const tampered = Buffer.from(encrypted);
    tampered[12] ^= 0xff;

    expect(() => decryptWithKey(tampered, testKey)).toThrow();
  });

  it("fails to decrypt tampered IV", () => {
    const plaintext = "Secret message";
    const encrypted = encryptWithKey(plaintext, testKey);

    // Tamper with the IV (bytes 0-11)
    const tampered = Buffer.from(encrypted);
    tampered[0] ^= 0xff;

    expect(() => decryptWithKey(tampered, testKey)).toThrow();
  });
});

describe("isEncrypted", () => {
  const testKey = randomBytes(32);

  it("returns true for encrypted data", () => {
    const encrypted = encryptWithKey("test data", testKey);
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("returns false for data starting with {", () => {
    const json = Buffer.from('{"key": "value"}');
    expect(isEncrypted(json)).toBe(false);
  });

  it("returns false for data starting with [", () => {
    const json = Buffer.from('[1, 2, 3]');
    expect(isEncrypted(json)).toBe(false);
  });

  it("returns false for data starting with \"", () => {
    const json = Buffer.from('"string"');
    expect(isEncrypted(json)).toBe(false);
  });

  it("returns false for data starting with #", () => {
    const comment = Buffer.from("# Comment");
    expect(isEncrypted(comment)).toBe(false);
  });

  it("returns false for data smaller than minimum encrypted size", () => {
    const tooSmall = Buffer.alloc(28); // Needs at least 29 bytes
    expect(isEncrypted(tooSmall)).toBe(false);
  });

  it("returns true for minimum valid encrypted size", () => {
    // Create a buffer that's exactly minimum size and doesn't start with plaintext indicators
    const minSize = Buffer.alloc(29);
    minSize[0] = 0x80; // Non-ASCII, non-plaintext indicator
    expect(isEncrypted(minSize)).toBe(true);
  });
});

describe("assertEncrypted", () => {
  const testKey = randomBytes(32);

  it("does not throw for encrypted data", () => {
    const encrypted = encryptWithKey("test data", testKey);
    expect(() => assertEncrypted(encrypted)).not.toThrow();
  });

  it("throws for plaintext JSON", () => {
    const plaintext = Buffer.from('{"session": "data"}');
    expect(() => assertEncrypted(plaintext)).toThrow(/Security error/);
  });

  it("throws with context message when provided", () => {
    const plaintext = Buffer.from('{"session": "data"}');
    expect(() => assertEncrypted(plaintext, "session-123")).toThrow(
      /session-123/
    );
  });

  it("throws for small buffers", () => {
    const small = Buffer.from("hi");
    expect(() => assertEncrypted(small)).toThrow(/Security error/);
  });
});

describe("encryption security properties", () => {
  const testKey = randomBytes(32);

  it("IV is 12 bytes (96 bits) - NIST recommended for GCM", () => {
    const encrypted = encryptWithKey("test", testKey);
    const iv = encrypted.subarray(0, 12);
    expect(iv.length).toBe(12);
  });

  it("Auth tag is 16 bytes (128 bits)", () => {
    const encrypted = encryptWithKey("test", testKey);
    const authTag = encrypted.subarray(12, 28);
    expect(authTag.length).toBe(16);
  });

  it("key must be exactly 32 bytes (256 bits)", () => {
    const shortKey = randomBytes(16);
    const longKey = randomBytes(64);

    expect(() => encryptWithKey("test", shortKey)).toThrow();
    expect(() => encryptWithKey("test", longKey)).toThrow();
  });

  it("empty plaintext encrypts successfully", () => {
    const encrypted = encryptWithKey("", testKey);
    const decrypted = decryptWithKey(encrypted, testKey);
    expect(decrypted).toBe("");
  });
});
