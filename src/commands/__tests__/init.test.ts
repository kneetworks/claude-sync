import { randomBytes } from "crypto";
import { describe, it, expect } from "vitest";
import { encryptWithKey } from "../../crypto/encrypt.js";
import { checkKey } from "../init.js";

describe("checkKey", () => {
  const key = randomBytes(32);
  const sample = encryptWithKey("a synced session", key);

  it("accepts the key the storage was encrypted with", () => {
    expect(checkKey(` ${key.toString("base64")}\n`, sample)).toBe(true);
  });

  it("rejects another machine's key before it's saved", () => {
    expect(checkKey(randomBytes(32).toString("base64"), sample)).toMatch(/can't read/);
  });

  it("rejects something that isn't a key", () => {
    expect(checkKey("not a key", sample)).toMatch(/256-bit/);
  });
});
