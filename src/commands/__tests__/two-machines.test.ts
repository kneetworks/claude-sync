import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { afterAll, describe, expect, it } from "vitest";

// Runs the built CLI as machines sharing one local git storage
const DIST = fileURLToPath(new URL("../../../dist", import.meta.url));
const CLI = path.join(DIST, "cli.js");
const SESSION = "11111111-2222-4333-8444-555555555555";
const KEY = `@home-code-app/${SESSION}`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sync-test-"));
const encode = (p: string) => p.replace(/[^a-zA-Z0-9]/g, "-");

function machine(dir: string, name: string) {
  const home = path.join(dir, name);
  fs.mkdirSync(home, { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData") };
  const check = (result: ReturnType<typeof spawnSync>, what: string) => {
    if (result.status !== 0) throw new Error(`${name} ${what}: ${result.stderr || result.stdout}`);
    return String(result.stdout);
  };
  return {
    config: () => JSON.parse(fs.readFileSync(path.join(home, ".claude-sync", "config.json"), "utf-8")),
    transcript: path.join(home, ".claude", "projects", encode(path.join(home, "code", "app")), `${SESSION}.jsonl`),
    run(args: string[], input?: string, extra?: NodeJS.ProcessEnv): string {
      return check(
        spawnSync(process.execPath, [CLI, ...args], { env: { ...env, ...extra }, input, encoding: "utf-8" }),
        args.join(" ")
      );
    },
    // Calls a function the dashboard uses, which has no command of its own
    call(fn: string, ...args: unknown[]): unknown {
      return this.callIn("commands/sync.js", fn, ...args);
    },
    callIn(file: string, fn: string, ...args: unknown[]): any {
      const module = pathToFileURL(path.join(DIST, file)).href;
      const code = `const m = await import(${JSON.stringify(module)}); console.log(JSON.stringify(await m.${fn}(...${JSON.stringify(args)}) ?? null));`;
      return JSON.parse(check(spawnSync(process.execPath, ["--input-type=module", "-e", code], { env, encoding: "utf-8" }), fn));
    },
  };
}

/**
 * Two machines with one conversation, synced to both
 */
function setUp(name: string) {
  const dir = path.join(work, name);
  const storage = path.join(dir, "storage.git");
  spawnSync("git", ["init", "-q", "--bare", "-b", "main", storage]);
  const a = machine(dir, "a");
  const b = machine(dir, "b");
  a.run(["init", "--git", storage]);
  const key = a.run(["key", "export"]).match(/[A-Za-z0-9+/]{43}=/)![0];
  b.run(["init", "--git", storage, "--key", key]);

  fs.mkdirSync(path.dirname(a.transcript), { recursive: true });
  fs.writeFileSync(a.transcript, `${message(1)}\n${message(2)}\n`);
  a.run(["sync"]);
  b.run(["sync"]);
  const git = (...args: string[]) => spawnSync("git", ["-C", storage, ...args], { encoding: "utf-8" }).stdout.trim();
  const stored = () => git("ls-tree", "-r", "--name-only", "main");
  const commits = () => Number(git("rev-list", "--count", "main"));
  return { a, b, stored, commits };
}

const message = (minute: number) =>
  JSON.stringify({ type: "user", timestamp: `2026-01-01T10:0${minute}:00Z`, message: { content: `message ${minute}` } });
const contents = (file: string) =>
  fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((line) => {
    const record = JSON.parse(line);
    return record.message?.content ?? record.type;
  });

afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

describe.skipIf(!fs.existsSync(CLI))("two machines", () => {
  it("continue from the latest message after closing a stale window", { timeout: 120_000 }, () => {
    const { a, b } = setUp("switch");

    // The conversation goes on on A
    fs.appendFileSync(a.transcript, `${message(3)}\n${message(4)}\n`);
    a.run(["sync"]);

    // B still had it open: closing it writes bookkeeping, then the SessionEnd hook runs
    fs.appendFileSync(b.transcript, `${JSON.stringify({ type: "cost-state" })}\n`);
    b.run(["sync", "--hook"], JSON.stringify({ session_id: SESSION, hook_event_name: "SessionEnd" }));

    // Sync now on B brings A's copy, which the hook must not have overwritten
    b.run(["sync"]);
    expect(contents(b.transcript)).toEqual(["message 1", "message 2", "message 3", "message 4"]);
  });

  it("set up from the dashboard: a new key for empty storage, the existing key otherwise", { timeout: 120_000 }, () => {
    const { a } = setUp("dashboard-setup");
    const dir = path.join(work, "dashboard-setup");
    const storage = path.join(dir, "storage.git");
    const SETUP = "utils/storage-setup.js";

    // A storage that already has conversations asks for their key, and checks it
    const c = machine(dir, "c");
    const connection = c.callIn(SETUP, "connectStorage", "git", { url: storage });
    expect(connection.step).toBe("key");
    expect(() => c.callIn(SETUP, "provideKey", connection.pending, Buffer.alloc(32, 1).toString("base64"))).toThrow(/can't read/);
    const key = a.run(["key", "export"]).match(/[A-Za-z0-9+/]{43}=/)![0];
    c.callIn(SETUP, "provideKey", connection.pending, key);
    c.run(["sync"]);
    expect(contents(c.transcript)).toEqual(["message 1", "message 2"]);

    // An empty storage gets a new key
    const empty = path.join(dir, "empty.git");
    spawnSync("git", ["init", "-q", "--bare", "-b", "main", empty]);
    const d = machine(dir, "d");
    expect(d.callIn(SETUP, "connectStorage", "git", { url: empty })).toEqual({ step: "new" });
    expect(d.run(["key", "export"])).toMatch(/[A-Za-z0-9+/]{43}=/);
  });

  it("still accept the push and pull options earlier versions' hooks use", { timeout: 120_000 }, () => {
    const { a, b } = setUp("compat");
    fs.appendFileSync(a.transcript, `${message(3)}\n`);
    a.run(["push", "--session", SESSION, "--file", a.transcript, "--all"]);
    b.run(["pull", "--session", SESSION]);
    expect(contents(b.transcript)).toEqual(["message 1", "message 2", "message 3"]);
  });

  it("delete a conversation here and from storage, while the other keeps its copy", { timeout: 120_000 }, () => {
    const { a, b, stored } = setUp("delete");
    expect(stored()).toContain(SESSION);

    expect(a.call("deleteConversations", [KEY])).toEqual({ deleted: 1 });
    expect(fs.existsSync(a.transcript)).toBe(false);
    expect(stored()).not.toContain(SESSION);

    // B's unchanged copy stays where it is, and isn't uploaded again
    b.run(["sync"]);
    expect(fs.existsSync(b.transcript)).toBe(true);
    expect(stored()).not.toContain(SESSION);
    a.run(["sync"]);
    expect(fs.existsSync(a.transcript)).toBe(false);
  });

  it("remove a conversation from one machine only, then download it again", { timeout: 120_000 }, () => {
    const { a, stored } = setUp("remove-here");

    // Not while it has changes the storage doesn't have
    fs.appendFileSync(a.transcript, `${message(3)}\n`);
    expect(a.call("deleteConversations", [KEY], false)).toMatchObject({ deleted: 0 });
    expect(fs.existsSync(a.transcript)).toBe(true);

    a.run(["sync"]);
    expect(a.call("deleteConversations", [KEY], false)).toEqual({ deleted: 1 });
    expect(fs.existsSync(a.transcript)).toBe(false);
    expect(stored()).toContain(SESSION);

    // Sync leaves it in storage only; Download (restore) brings it back
    a.run(["sync"]);
    expect(fs.existsSync(a.transcript)).toBe(false);
    a.call("syncSilently", [KEY]);
    expect(contents(a.transcript)).toEqual(["message 1", "message 2", "message 3"]);
  });

  it("compact the storage history without changing its files", { timeout: 120_000 }, () => {
    const { a, b, stored, commits } = setUp("compact");
    fs.appendFileSync(a.transcript, `${message(3)}\n`);
    a.run(["sync"]);
    const files = stored();
    expect(commits()).toBeGreaterThan(1);

    expect(a.call("compactStorage")).toMatchObject({ commits: 2 });
    expect(commits()).toBe(1);
    expect(stored()).toBe(files);

    // B picks up the new history at its next sync, and then has nothing left to compact
    b.run(["sync"]);
    expect(contents(b.transcript)).toContain("message 3");
    expect(b.call("compactStorage")).toMatchObject({ commits: 1 });
  });

  it("restore a conversation removed here after it synced", { timeout: 120_000 }, () => {
    const { a } = setUp("restore");

    // As Claude Code's cleanup does: a plain sync doesn't bring it back
    fs.rmSync(a.transcript);
    a.run(["sync"]);
    expect(fs.existsSync(a.transcript)).toBe(false);

    a.call("syncSilently", [KEY]);
    expect(contents(a.transcript)).toEqual(["message 1", "message 2"]);
  });

  it("keep a week of storage history, the same for every machine", { timeout: 120_000 }, () => {
    const dir = path.join(work, "history");
    const storage = path.join(dir, "storage.git");
    spawnSync("git", ["init", "-q", "--bare", "-b", "main", storage]);
    const a = machine(dir, "a");
    const b = machine(dir, "b");
    a.run(["init", "--git", storage]);
    b.run(["init", "--git", storage, "--key", a.run(["key", "export"]).match(/[A-Za-z0-9+/]{43}=/)![0]]);
    const git = (...args: string[]) => spawnSync("git", ["-C", storage, ...args], { encoding: "utf-8" }).stdout.trim();
    const commits = () => Number(git("rev-list", "--count", "main"));
    const version = (commit: string) => git("rev-parse", `${commit}:projects/${KEY}.jsonl.enc`);

    // Synced 10, 9 and 1 days ago, then now
    fs.mkdirSync(path.dirname(a.transcript), { recursive: true });
    for (const [i, daysAgo] of [10, 9, 1, 0].entries()) {
      fs.appendFileSync(a.transcript, `${message(i + 1)}\n`);
      const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
      a.run(["sync"], undefined, { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    }
    const files = git("ls-tree", "-r", "main");
    const [tenDaysAgo, nineDaysAgo] = [version("main~3"), version("main~2")];

    // A week by default: the version still current a week ago stays, the older one goes
    expect(a.call("historyTrimDue", a.config())).toBe(true);
    a.call("compactStorage", true);
    expect(commits()).toBe(3);
    expect(git("ls-tree", "-r", "main")).toBe(files);
    const kept = git("rev-list", "--objects", "main");
    expect(kept).toContain(nineDaysAgo);
    expect(kept).not.toContain(tenDaysAgo);
    expect(a.call("historyTrimDue", a.config())).toBe(false);

    // The other machine syncs as before, then drops the old versions from its own copy
    b.run(["sync"]);
    expect(contents(b.transcript)).toEqual(["message 1", "message 2", "message 3", "message 4"]);
    expect(b.call("historyTrimDue", b.config())).toBe(true);
    b.call("compactStorage", true);
    expect(commits()).toBe(3);
    expect(b.call("historyTrimDue", b.config())).toBe(false);

    // One setting for every machine, kept beside the conversations
    a.call("updateStorageSettings", { keepHistoryDays: null });
    b.run(["sync"]);
    expect(b.call("loadStorageSettings", b.config())).toEqual({ keepHistoryDays: null });
    expect(git("ls-tree", "-r", "main", "--", "projects")).toBe(files);
  });

  it("notice a conversation that changed but hasn't synced, for syncing when idle", { timeout: 120_000 }, () => {
    const { a } = setUp("idle");
    expect(a.call("lastUnsyncedChange", a.config())).toBe(0);

    // Left open: written to, with no session end to sync it
    fs.appendFileSync(a.transcript, `${message(3)}\n`);
    expect(a.call("lastUnsyncedChange", a.config())).toBe(fs.statSync(a.transcript).mtimeMs);

    // A project that doesn't sync here has nothing to wait for
    const unselected = { ...a.config(), selection: { projects: { "@home-code-app": false }, conversations: {} } };
    expect(a.call("lastUnsyncedChange", unselected)).toBe(0);

    a.run(["sync"]);
    expect(a.call("lastUnsyncedChange", a.config())).toBe(0);
  });
});
