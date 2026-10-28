import { describe, it, expect } from "vitest";
import path from "path";
import {
  belongsToSession,
  encodeProjectDir,
  isSafeRemotePath,
  toFolderMappings,
  toLocalPath,
  toLocalProject,
  toPortableProject,
  toRemotePath,
} from "../sessions.js";

const WINDOWS_HOME = "C:\\Users\\alex";
const MAC_HOME = "/Users/sam";

describe("encodeProjectDir", () => {
  it("matches Claude Code's project folder names", () => {
    expect(encodeProjectDir("C:\\Users\\alex\\Workspace\\my-app")).toBe(
      "C--Users-alex-Workspace-my-app"
    );
    expect(encodeProjectDir("/Users/sam/code/my.app")).toBe("-Users-sam-code-my-app");
  });
});

describe("portable project names", () => {
  it("replaces the home directory with a token", () => {
    expect(
      toPortableProject("C--Users-alex-Workspace-my-app", WINDOWS_HOME)
    ).toBe("@home-Workspace-my-app");
  });

  it("ignores drive-letter case (VS Code uses c:)", () => {
    expect(
      toPortableProject("c--Users-alex-Workspace-my-app", WINDOWS_HOME)
    ).toBe("@home-Workspace-my-app");
  });

  it("maps to the same project on another machine and OS", () => {
    const portable = toPortableProject("-Users-sam-Workspace-app", MAC_HOME);
    expect(toLocalProject(portable, WINDOWS_HOME)).toBe("C--Users-alex-Workspace-app");
  });

  it("does not treat a longer username as the home directory", () => {
    expect(toPortableProject("C--Users-alexander-app", WINDOWS_HOME)).toBe(
      "C--Users-alexander-app"
    );
  });

  it("leaves projects outside home unchanged", () => {
    expect(toPortableProject("D--work-app", WINDOWS_HOME)).toBe("D--work-app");
    expect(toLocalProject("D--work-app", MAC_HOME)).toBe("D--work-app");
  });
});

describe("folders kept elsewhere on this machine", () => {
  const folders = toFolderMappings({ "~/Workspace": "D:\\Projects" }, WINDOWS_HOME);

  it("encodes the config's folders", () => {
    expect(folders).toEqual([{ remote: "@home-Workspace", local: "D--Projects" }]);
    expect(toFolderMappings({ "~\\Workspace": "/Volumes/code" }, MAC_HOME)).toEqual([
      { remote: "@home-Workspace", local: "-Volumes-code" },
    ]);
  });

  it("stores them as if they were where the other machines keep them", () => {
    expect(toPortableProject("d--Projects-website", WINDOWS_HOME, folders)).toBe(
      "@home-Workspace-website"
    );
    expect(toLocalProject("@home-Workspace-website", WINDOWS_HOME, folders)).toBe(
      "D--Projects-website"
    );
  });

  it("leaves other projects to the home mapping", () => {
    expect(toLocalProject("@home-Workspaces-app", WINDOWS_HOME, folders)).toBe(
      "C--Users-alex-Workspaces-app"
    );
    expect(toLocalProject("@home-OneDrive-app", WINDOWS_HOME, folders)).toBe(
      "C--Users-alex-OneDrive-app"
    );
    expect(toPortableProject("D--Projects2-app", WINDOWS_HOME, folders)).toBe(
      "D--Projects2-app"
    );
  });
});

describe("remote paths", () => {
  it("round-trips a nested file", () => {
    const remote = toRemotePath(
      "c--Users-alex-Workspace-app/abc/subagents/agent-1.jsonl",
      WINDOWS_HOME
    );
    expect(remote).toBe("@home-Workspace-app/abc/subagents/agent-1.jsonl");
    expect(toLocalPath(remote, MAC_HOME)).toBe(
      path.join(MAC_HOME, ".claude", "projects", "-Users-sam-Workspace-app", "abc", "subagents", "agent-1.jsonl")
    );
  });

  it("rejects paths that could escape the projects folder", () => {
    expect(isSafeRemotePath("@home-app/abc.jsonl")).toBe(true);
    expect(isSafeRemotePath("@home-app/memory/MEMORY.md")).toBe(true);
    expect(isSafeRemotePath("../evil")).toBe(false);
    expect(isSafeRemotePath("@home-app/../../evil")).toBe(false);
    expect(isSafeRemotePath("@home-app//evil")).toBe(false);
    expect(isSafeRemotePath("@home-app/C:evil")).toBe(false);
    expect(isSafeRemotePath("@home-app\\..\\evil")).toBe(false);
    expect(isSafeRemotePath("lonely-file")).toBe(false);
  });

  it("recognises a session's transcript and folder", () => {
    expect(belongsToSession("@home-app/abc.jsonl", "abc")).toBe(true);
    expect(belongsToSession("@home-app/abc/tool-results/x.txt", "abc")).toBe(true);
    expect(belongsToSession("@home-app/abcd.jsonl", "abc")).toBe(false);
    expect(belongsToSession("@home-app/memory/abc.md", "abc")).toBe(false);
  });
});
