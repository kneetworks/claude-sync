import { describe, it, expect } from "vitest";
import { resolve, sha256 } from "../merge.js";

const buf = (s: string) => Buffer.from(s);

describe("resolve", () => {
  it("takes the remote copy when there is no local file", () => {
    expect(resolve(null, buf("a\n"))).toBe("take-remote");
  });

  it("does nothing when both copies match", () => {
    expect(resolve(buf("a\n"), buf("a\n"))).toBe("same");
  });

  it("takes the remote copy when it extends the local transcript", () => {
    expect(resolve(buf("a\n"), buf("a\nb\n"))).toBe("take-remote");
  });

  it("keeps the local copy when it extends the remote transcript", () => {
    expect(resolve(buf("a\nb\n"), buf("a\n"))).toBe("keep-local");
  });

  it("takes the remote copy when the local file hasn't changed since the last sync", () => {
    const local = buf("old memory");
    expect(resolve(local, buf("new memory"), sha256(local))).toBe("take-remote");
  });

  it("reports a conflict when both copies changed", () => {
    expect(resolve(buf("a\nlocal\n"), buf("a\nremote\n"), sha256(buf("a\n")))).toBe(
      "conflict"
    );
    expect(resolve(buf("local"), buf("remote"))).toBe("conflict");
  });
});
