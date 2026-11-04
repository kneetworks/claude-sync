import { spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { homedir } from "os";

const NAME = "claude-sync";

/**
 * Where each OS looks for programs to start at login
 */
export function autostartFile(platform: NodeJS.Platform = process.platform, home = homedir()): string {
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", `${NAME}.lnk`);
  }
  if (platform === "darwin") return path.join(home, "Library", "LaunchAgents", `${NAME}.tray.plist`);
  const config = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(config, "autostart", `${NAME}.desktop`);
}

const xml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A macOS LaunchAgent; PATH is kept so git is found the same way as in a terminal
 */
export function launchAgent(args: string[], envPath?: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    `  <key>Label</key><string>${NAME}.tray</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...args.map((arg) => `    <string>${xml(arg)}</string>`),
    "  </array>",
    ...(envPath
      ? ["  <key>EnvironmentVariables</key>", `  <dict><key>PATH</key><string>${xml(envPath)}</string></dict>`]
      : []),
    "  <key>RunAtLoad</key><true/>",
    "  <key>ProcessType</key><string>Interactive</string>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/**
 * Quote one argument of a desktop entry's Exec line, per the Desktop Entry spec
 */
function desktopArg(arg: string): string {
  let value = arg.replace(/%/g, "%%");
  if (/[\s"'\\><~|&;$*?#()`]/.test(value)) value = `"${value.replace(/(["`$\\])/g, "\\$1")}"`;
  // Desktop files unescape backslashes once more before splitting the line
  return value.replace(/\\/g, "\\\\");
}

/**
 * A Linux (XDG) autostart entry
 */
export function desktopEntry(args: string[]): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${NAME}`,
    "Comment=Sync Claude Code conversations across machines",
    `Exec=${args.map(desktopArg).join(" ")}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

/**
 * A Startup folder shortcut. It starts minimized: node is a console program, so a
 * window shows until `claude-sync tray` hands over to its hidden background process.
 */
function createShortcut(file: string, target: string, args: string): void {
  const script =
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:CS_LINK); " +
    "$s.TargetPath = $env:CS_TARGET; $s.Arguments = $env:CS_ARGS; $s.WindowStyle = 7; " +
    "$s.Description = 'claude-sync'; $s.Save()";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, CS_LINK: file, CS_TARGET: target, CS_ARGS: args },
    encoding: "utf-8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.error?.message || "couldn't create the shortcut");
  }
}

/**
 * Start the tray icon at login; returns the file that does it
 */
export async function enableAutostart(node: string, cli: string): Promise<string> {
  const file = autostartFile();
  await fs.mkdir(path.dirname(file), { recursive: true });

  if (process.platform === "win32") {
    createShortcut(file, node, `"${cli}" tray`);
  } else if (process.platform === "darwin") {
    await fs.writeFile(file, launchAgent([node, cli, "tray", "--foreground"], process.env.PATH));
  } else {
    await fs.writeFile(file, desktopEntry([node, cli, "tray", "--foreground"]));
  }
  return file;
}

export async function isAutostartEnabled(): Promise<boolean> {
  return fs.access(autostartFile()).then(
    () => true,
    () => false
  );
}

/**
 * Stop starting the tray icon at login; false if it wasn't set up
 */
export async function disableAutostart(): Promise<boolean> {
  return fs.rm(autostartFile()).then(
    () => true,
    () => false
  );
}
