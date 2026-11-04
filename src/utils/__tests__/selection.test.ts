import { describe, it, expect } from "vitest";
import {
  conversationKey,
  isSelected,
  selectConversation,
  selectProject,
} from "../selection.js";

const SESSION = "0b6e2c1a-4d3f-4a8e-9c2b-7f1d5e3a9b10";
const TRANSCRIPT = `@home-code-app/${SESSION}.jsonl`;
const SUBAGENT = `@home-code-app/${SESSION}/subagents/agent-1.jsonl`;

describe("conversationKey", () => {
  it("groups a transcript with its subagents and tool results", () => {
    expect(conversationKey(TRANSCRIPT)).toBe(`@home-code-app/${SESSION}`);
    expect(conversationKey(SUBAGENT)).toBe(`@home-code-app/${SESSION}`);
  });
});

describe("isSelected", () => {
  it("syncs everything by default", () => {
    expect(isSelected(TRANSCRIPT)).toBe(true);
    expect(isSelected("@home-code-app/memory/MEMORY.md", {})).toBe(true);
  });

  it("skips every file of an unchecked project, memory included", () => {
    const selection = { projects: { "@home-code-app": false } };
    expect(isSelected(TRANSCRIPT, selection)).toBe(false);
    expect(isSelected("@home-code-app/memory/MEMORY.md", selection)).toBe(false);
    expect(isSelected("@home-code-other/x.jsonl", selection)).toBe(true);
  });

  it("lets a conversation override its project", () => {
    const selection = {
      projects: { "@home-code-app": false },
      conversations: { [`@home-code-app/${SESSION}`]: true },
    };
    expect(isSelected(TRANSCRIPT, selection)).toBe(true);
    expect(isSelected(SUBAGENT, selection)).toBe(true);
    expect(isSelected("@home-code-app/other.jsonl", selection)).toBe(false);
  });
});

describe("selectProject", () => {
  it("unchecks a project and drops its conversation overrides", () => {
    const selection = selectProject(
      { conversations: { [`@home-code-app/${SESSION}`]: false, "@home-code-web/x": false } },
      "@home-code-app",
      false
    );
    expect(selection).toEqual({
      projects: { "@home-code-app": false },
      conversations: { "@home-code-web/x": false },
    });
  });

  it("checks a project by removing its entry, since syncing is the default", () => {
    const selection = selectProject({ projects: { "@home-code-app": false } }, "@home-code-app", true);
    expect(selection.projects).toEqual({});
  });
});

describe("selectConversation", () => {
  it("records only settings that differ from the project", () => {
    const key = `@home-code-app/${SESSION}`;
    const off = selectConversation({}, key, false);
    expect(off.conversations).toEqual({ [key]: false });
    expect(selectConversation(off, key, true).conversations).toEqual({});
  });

  it("checks one conversation inside an unchecked project", () => {
    const key = `@home-code-app/${SESSION}`;
    const selection = selectConversation({ projects: { "@home-code-app": false } }, key, true);
    expect(isSelected(TRANSCRIPT, selection)).toBe(true);
  });
});
