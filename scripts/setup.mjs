// Installs claude-sync from this folder: builds it, makes `claude-sync` a command in
// every shell, connects it to your storage the first time, and turns on automatic
// sync with the notification area icon. The install-* scripts in the folder above
// run it; running it again updates claude-sync.
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const STATE_DIR = path.join(homedir(), ".claude-sync");
const PNPM = "pnpm@9.15.0";
const OPEN = !process.argv.includes("--no-open");

function step(title) {
  console.log(`\n== ${title}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`\`${[command, ...args].join(" ")}\` didn't finish`);
}

function read(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf-8", ...options });
  return result.status === 0 ? result.stdout.trim() : null;
}

// npm and npx are .cmd scripts on Windows, which only start through a shell. These
// command lines never need quoting, so they go to the shell whole.
const npm = (commandLine) => run(commandLine, [], { shell: true });
const readNpm = (commandLine) => read(commandLine, [], { shell: true });

function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), "utf-8"));
  } catch {
    return null;
  }
}

function trayRunning() {
  const tray = readState("tray.json");
  if (!tray) return false;
  try {
    process.kill(tray.pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    throw new Error(`claude-sync needs Node.js 18 or later, and this is ${process.version}: https://nodejs.org`);
  }
  if (read("git", ["--version"]) === null) {
    console.log("Git isn't installed. You need it to keep your sessions in a Git repository: https://git-scm.com");
  }

  step("Building claude-sync");
  npm(`npx --yes ${PNPM} install --frozen-lockfile`);
  npm(`npx --yes ${PNPM} build`);

  step("Installing the claude-sync command");
  const file = JSON.parse(readNpm("npm pack --json") ?? "[]")[0]?.filename;
  if (!file) throw new Error("`npm pack` didn't produce a package");
  const fromFolder = path.join(ROOT, "dist", "cli.js");
  let claudeSync = (args) => run(process.execPath, [fromFolder, ...args]);
  try {
    // --force replaces `claude-sync` launchers npm didn't create, such as ones made
    // by hand for an earlier build, which npm would otherwise refuse to overwrite
    npm(`npm install --global --force ./${file}`);
    // Run the installed command from here on, so the hooks and the icon point at the
    // installed copy and keep working if this folder moves
    if (readNpm("claude-sync --version") !== null) {
      claudeSync = (args) => npm(`claude-sync ${args.join(" ")}`);
    } else {
      console.log("\nThe `claude-sync` command isn't on your PATH yet, so claude-sync will run from this folder.");
    }
  } catch {
    console.log(
      "\nCouldn't install the `claude-sync` command (see npm's message above), so claude-sync will run" +
        "\nfrom this folder: leave the folder where it is. On macOS and Linux, npm usually needs a folder" +
        "\nof your own for commands: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"
    );
  } finally {
    fs.rmSync(path.join(ROOT, file), { force: true });
  }

  if (!readState("config.json")?.initialized) {
    step("Connecting your storage");
    claudeSync(["init"]);
  }

  step("Syncing");
  try {
    claudeSync(["sync"]);
  } catch {
    console.log("\nThe sync didn't finish; Claude Code will try again when a session starts.");
  }

  step("Turning on automatic sync");
  claudeSync(["install"]);

  if (OPEN) {
    // `install` starts the icon in the background: open its dashboard once it's up
    for (let i = 0; i < 50 && !trayRunning(); i++) await sleep(100);
    if (trayRunning()) claudeSync(["dashboard"]);
  }

  console.log(
    "\nclaude-sync is set up. It syncs whenever a Claude Code session starts and ends, and its icon" +
      "\nshows when it's syncing. Run this installer again to update claude-sync."
  );
} catch (error) {
  console.error(`\nSetup stopped: ${error.message}`);
  process.exitCode = 1;
}
