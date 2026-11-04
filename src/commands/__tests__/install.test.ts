import { describe, it, expect } from "vitest";
import { commandPaths } from "../install.js";

describe("commandPaths", () => {
  it("finds node and claude-sync in a hook command", () => {
    expect(commandPaths('"C:/Program Files/nodejs/node.exe" "D:/tools/claude-sync/dist/cli.js" sync --hook')).toEqual([
      "C:/Program Files/nodejs/node.exe",
      "D:/tools/claude-sync/dist/cli.js",
    ]);
  });

  it("finds nothing in a command without quoted paths", () => {
    expect(commandPaths("claude-sync sync --hook")).toEqual([]);
  });
});
