import path from "path";
import { describe, it, expect } from "vitest";
import { autostartFile, desktopEntry, launchAgent } from "../autostart.js";
import { trayHelper } from "../helpers.js";
import { trayStatus } from "../status.js";

const synced = { at: Date.now(), pulled: 1, pushed: 2, warnings: [] };

describe("trayStatus", () => {
  it("shows a sync in progress over anything else", () => {
    expect(trayStatus(true, { ...synced, error: "offline" })).toMatchObject({
      state: "syncing",
      status: "Syncing…",
    });
  });

  it("asks for attention after a failed sync or one with warnings", () => {
    expect(trayStatus(false, { ...synced, error: "offline" })).toMatchObject({
      state: "attention",
      status: "The last sync failed",
    });
    expect(trayStatus(false, { ...synced, warnings: ["a", "b"] })).toMatchObject({
      state: "attention",
      status: "Synced with 2 warnings",
    });
  });

  it("is up to date otherwise, within Windows' tooltip limit", () => {
    const status = trayStatus(false, synced);
    expect(status.state).toBe("idle");
    expect(status.status).toMatch(/^Up to date · synced /);
    expect(status.tooltip.length).toBeLessThanOrEqual(63);
    expect(trayStatus(false, null).status).toBe("Not synced yet");
  });
});

describe("trayHelper", () => {
  it("uses tools each OS already has", () => {
    expect(trayHelper("/t", "win32").command).toBe("powershell.exe");
    expect(trayHelper("/t", "darwin").command).toBe("/usr/bin/osascript");
    expect(trayHelper("/t", "linux").command).toBe("python3");
  });

  it("keeps the Windows script ASCII, which PowerShell 5.1 reads without a BOM", () => {
    expect(trayHelper("/t", "win32").script).toMatch(/^[\x00-\x7f]*$/);
  });

  it("writes JavaScript that parses", () => {
    expect(() => new Function(trayHelper("/t", "darwin").script)).not.toThrow();
  });
});

describe("autostart", () => {
  it("uses each OS's login items", () => {
    expect(autostartFile("darwin", "/Users/sam")).toBe(
      path.join("/Users/sam", "Library", "LaunchAgents", "claude-sync.tray.plist")
    );
  });

  it("escapes a LaunchAgent's arguments", () => {
    const plist = launchAgent(["/usr/local/bin/node", "/Users/sam/R&D/cli.js", "tray"], "/usr/bin:/bin");
    expect(plist).toContain("<string>/Users/sam/R&amp;D/cli.js</string>");
    expect(plist).toContain("<key>PATH</key><string>/usr/bin:/bin</string>");
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
  });

  it("quotes desktop entry arguments that need it", () => {
    const entry = desktopEntry(["/usr/bin/node", "/home/sam/my tools/cli.js", "tray", "--foreground"]);
    expect(entry).toContain('Exec=/usr/bin/node "/home/sam/my tools/cli.js" tray --foreground');
    expect(desktopEntry(["/opt/100%/node"])).toContain("Exec=/opt/100%%/node");
  });
});
