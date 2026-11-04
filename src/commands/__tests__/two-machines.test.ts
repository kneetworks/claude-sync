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
    transcript: path.join(home, ".claude", "projects", encode(path.join(home, "code", "app")), `${SESSION}.jsonl`),
    run(args: string[], input?: string): string {
      return check(spawnSync(process.execPath, [CLI, ...args], { env, input, encoding: "utf-8" }), args.join(" "));
    },
    // Calls a function the dashboard uses, which has no command of its own
    call(fn: string, ...args: unknown[]): unknown {
      const module = pathToFileURL(path.join(DIST, "commands", "sync.js")).href;
      const code = `const m = await import(${JSON.stringify(module)}); console.log(JSON.stringify(await m.${fn}(...${JSON.stringify(args)})));`;
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
  const stored = () =>
    spawnSync("git", ["-C", storage, "ls-tree", "-r", "--name-only", "main"], { encoding: "utf-8" }).stdout.trim();
  return { a, b, stored };
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

  it("restore a conversation removed here after it synced", { timeout: 120_000 }, () => {
    const { a } = setUp("restore");

    // As Claude Code's cleanup does: a plain sync doesn't bring it back
    fs.rmSync(a.transcript);
    a.run(["sync"]);
    expect(fs.existsSync(a.transcript)).toBe(false);

    a.call("syncSilently", [KEY]);
    expect(contents(a.transcript)).toEqual(["message 1", "message 2"]);
  });
});
