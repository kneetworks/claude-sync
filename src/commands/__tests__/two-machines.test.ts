import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterAll, describe, expect, it } from "vitest";

// Runs the built CLI as two machines sharing one local git storage
const CLI = fileURLToPath(new URL("../../../dist/cli.js", import.meta.url));
const SESSION = "11111111-2222-4333-8444-555555555555";

const work = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sync-test-"));
const storage = path.join(work, "storage.git");
const encode = (p: string) => p.replace(/[^a-zA-Z0-9]/g, "-");

function machine(name: string) {
  const home = path.join(work, name);
  fs.mkdirSync(home, { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData") };
  return {
    transcript: path.join(home, ".claude", "projects", encode(path.join(home, "code", "app")), `${SESSION}.jsonl`),
    run(args: string[], input?: string): string {
      const result = spawnSync(process.execPath, [CLI, ...args], { env, input, encoding: "utf-8" });
      if (result.status !== 0) throw new Error(`${name} ${args.join(" ")}: ${result.stderr || result.stdout}`);
      return result.stdout;
    },
  };
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
    spawnSync("git", ["init", "-q", "--bare", "-b", "main", storage]);
    const a = machine("a");
    const b = machine("b");
    a.run(["init", "--git", storage]);
    const key = a.run(["key", "export"]).match(/[A-Za-z0-9+/]{43}=/)![0];
    b.run(["init", "--git", storage, "--key", key]);

    fs.mkdirSync(path.dirname(a.transcript), { recursive: true });
    fs.writeFileSync(a.transcript, `${message(1)}\n${message(2)}\n`);
    a.run(["sync"]);
    b.run(["sync"]);

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
});
