import { describe, it, expect } from "vitest";
import { nameProject, summarizeTranscript } from "../conversations.js";

const line = (record: object) => JSON.stringify(record);
const prompt = (content: unknown, extra: object = {}) =>
  line({ type: "user", cwd: "/home/sam/code/app", message: { role: "user", content }, ...extra });

describe("summarizeTranscript", () => {
  it("prefers a name given with /rename, wherever it is", () => {
    const head = [prompt("Fix the login form"), line({ type: "ai-title", aiTitle: "Login fix" })];
    const tail = [line({ type: "custom-title", customTitle: "Auth work" })];
    expect(summarizeTranscript(head, tail)).toEqual({
      title: "Auth work",
      cwds: ["/home/sam/code/app"],
    });
  });

  it("lists working directories latest first", () => {
    const head = [prompt("hi")];
    const tail = [line({ type: "assistant", cwd: "/home/sam/code/app/.claude/worktrees/fix" })];
    expect(summarizeTranscript(head, tail).cwds).toEqual([
      "/home/sam/code/app/.claude/worktrees/fix",
      "/home/sam/code/app",
    ]);
  });

  it("uses the latest generated title", () => {
    const head = [prompt("hi"), line({ type: "ai-title", aiTitle: "Old title" })];
    const tail = [line({ type: "ai-title", aiTitle: "New title" })];
    expect(summarizeTranscript(head, tail).title).toBe("New title");
  });

  it("falls back to the first real prompt, skipping commands and meta messages", () => {
    const head = [
      prompt("<command-name>/clear</command-name>"),
      prompt("Caveat", { isMeta: true }),
      prompt([{ type: "tool_result", content: "x" }]),
      prompt([{ type: "text", text: "Add a   dark\nmode toggle" }]),
    ];
    expect(summarizeTranscript(head, []).title).toBe("Add a dark mode toggle");
  });

  it("finds the prompt after context the IDE adds in front of it", () => {
    const head = [
      prompt([
        { type: "text", text: "<ide_opened_file>src/app.ts</ide_opened_file>" },
        { type: "text", text: "Why does this crash?" },
      ]),
    ];
    expect(summarizeTranscript(head, []).title).toBe("Why does this crash?");
  });

  it("uses the slash command when the conversation has no typed prompt", () => {
    const command =
      "<command-message>review</command-message>\n<command-name>/review</command-name>\n" +
      "<command-args>the auth module</command-args>";
    expect(summarizeTranscript([prompt(command)], []).title).toBe("/review the auth module");
    expect(
      summarizeTranscript([prompt("<command-name>/doctor</command-name>")], []).title
    ).toBe("/doctor");
  });

  it("skips lines cut off at the edge of a read", () => {
    const head = ['{"type":"ai-title","aiTi', prompt("Write tests")];
    expect(summarizeTranscript(head, ['tle":"cut"}']).title).toBe("Write tests");
  });

  it("shortens long titles to one line", () => {
    const title = summarizeTranscript([prompt("x".repeat(300))], []).title!;
    expect(title).toHaveLength(120);
    expect(title.endsWith("…")).toBe(true);
  });

  it("returns nothing for a transcript without titles or prompts", () => {
    expect(summarizeTranscript([], [])).toEqual({ title: undefined, cwds: [] });
  });
});

describe("nameProject", () => {
  it("uses the folder whose name Claude Code stores the project under", () => {
    expect(
      nameProject("@home-code-app", "C--Users-sam-code-app", ["D:\\Projects\\app", "c:\\Users\\sam\\code\\app"])
    ).toEqual({ label: "app", path: "c:\\Users\\sam\\code\\app" });
  });

  it("names a project pulled from another machine without claiming its path", () => {
    expect(nameProject("@home-code-app", "-home-sam-code-app", ["D:\\Projects\\app"])).toEqual({
      label: "app",
    });
  });

  it("ignores a folder the session left for a worktree", () => {
    expect(
      nameProject("@home-code-app--claude-worktrees-fix", "-home-sam-code-app--claude-worktrees-fix", [
        "/home/sam/code/app",
      ])
    ).toEqual({ label: "code-app--claude-worktrees-fix" });
  });
});
