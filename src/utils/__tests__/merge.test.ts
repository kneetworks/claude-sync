import { describe, it, expect } from "vitest";
import { isLineMerged, mergeLines, resolve, sha256 } from "../merge.js";

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

describe("mergeLines", () => {
  const merge = (local: string, remote: string) =>
    mergeLines(buf(local), buf(remote)).toString();

  it("keeps the lines both machines added", () => {
    expect(merge("# Memory\n- a\n- local\n", "# Memory\n- a\n- remote\n")).toBe(
      "# Memory\n- a\n- remote\n- local\n"
    );
  });

  it("places remote lines in their section", () => {
    expect(
      merge("## A\n- a1\n\n## B\n- b1\n- b-local\n", "## A\n- a1\n- a2\n\n## B\n- b1\n")
    ).toBe("## A\n- a1\n- a2\n\n## B\n- b1\n- b-local\n");
  });

  it("doesn't repeat lines the copies order differently", () => {
    expect(merge("- b\n- a\n", "- a\n- b\n- c\n")).toBe("- b\n- a\n- c\n");
  });

  it("applies to each project's memory index only", () => {
    expect(isLineMerged("@home-app/memory/MEMORY.md")).toBe(true);
    expect(isLineMerged("@home-app/memory/user_role.md")).toBe(false);
    expect(isLineMerged("@home-app/abc/memory/MEMORY.md")).toBe(false);
    expect(isLineMerged("@home-app/abc.jsonl")).toBe(false);
  });
});
