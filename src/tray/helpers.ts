import path from "path";

/**
 * The notification area icon is drawn by a small script run with tools each OS
 * already has, so claude-sync needs no native module or downloaded binary.
 *
 * Protocol: claude-sync writes one JSON line per change ({ state, status, tooltip },
 * see TrayStatus) to the script's stdin; the script writes "open", "sync" or "quit"
 * to stdout when the user picks them, and exits when its stdin closes.
 */
export interface TrayHelper {
  /** Where the script is written before it runs */
  file: string;
  script: string;
  command: string;
  args: string[];
}

/** The script's exit code when this machine can't show a tray icon */
export const TRAY_UNSUPPORTED = 3;

export function trayHelper(dir: string, platform: NodeJS.Platform = process.platform): TrayHelper {
  if (platform === "win32") {
    const file = path.join(dir, "tray.ps1");
    return {
      file,
      script: WINDOWS,
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-WindowStyle", "Hidden", "-File", file],
    };
  }
  if (platform === "darwin") {
    const file = path.join(dir, "tray.js");
    const script = MACOS.replace("__TRAY_DIR__", JSON.stringify(dir));
    return { file, script, command: "/usr/bin/osascript", args: ["-l", "JavaScript", file] };
  }
  const file = path.join(dir, "tray.py");
  return { file, script: LINUX, command: "python3", args: [file] };
}

// Windows PowerShell 5.1 reads scripts without a BOM as ANSI, so this one is ASCII only
const WINDOWS = String.raw`# claude-sync notification area icon (see src/tray/helpers.ts)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$stdout = [Console]::Out
function Send([string]$message) {
  $stdout.WriteLine($message)
  $stdout.Flush()
}

# The icon for each state, written next to this script by claude-sync. Read into
# memory, so the files aren't locked while the icon runs.
$icons = @{}
foreach ($state in 'idle', 'syncing', 'attention') {
  $png = [System.IO.File]::ReadAllBytes((Join-Path $PSScriptRoot "icon-$state.png"))
  $bitmap = New-Object System.Drawing.Bitmap (New-Object System.IO.MemoryStream (, $png))
  $icons[$state] = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
}

$status = New-Object System.Windows.Forms.ToolStripMenuItem 'Starting...'
$status.Enabled = $false
$open = New-Object System.Windows.Forms.ToolStripMenuItem 'Open claude-sync'
$open.Font = New-Object System.Drawing.Font($open.Font, [System.Drawing.FontStyle]::Bold)
$open.add_Click({ Send 'open' })
$syncNow = New-Object System.Windows.Forms.ToolStripMenuItem 'Sync now'
$syncNow.add_Click({ Send 'sync' })
$quit = New-Object System.Windows.Forms.ToolStripMenuItem 'Quit claude-sync'
$quit.add_Click({ Send 'quit' })

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$separator1 = New-Object System.Windows.Forms.ToolStripSeparator
$separator2 = New-Object System.Windows.Forms.ToolStripSeparator
[void]$menu.Items.AddRange([System.Windows.Forms.ToolStripItem[]]@($status, $separator1, $open, $syncNow, $separator2, $quit))

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $icons['idle']
$tray.Text = 'claude-sync'
$tray.ContextMenuStrip = $menu
$tray.add_MouseClick({
  param($source, $click)
  if ($click.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Send 'open' }
})
$tray.Visible = $true

# Read stdin without blocking the UI thread: start a read, check on it from a timer
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$script:pending = $reader.ReadLineAsync()
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.add_Tick({
  while ($script:pending.IsCompleted) {
    $line = if ($script:pending.IsFaulted) { $null } else { $script:pending.Result }
    if ($null -eq $line) {
      $timer.Stop()
      [System.Windows.Forms.Application]::Exit()
      return
    }
    try {
      $message = $line | ConvertFrom-Json
      if ($icons.ContainsKey([string]$message.state)) { $tray.Icon = $icons[[string]$message.state] }
      $tip = [string]$message.tooltip
      if ($tip.Length -gt 63) { $tip = $tip.Substring(0, 63) }
      $tray.Text = $tip
      $status.Text = [string]$message.status
    } catch {
      [Console]::Error.WriteLine($_.Exception.Message)
    }
    $script:pending = $reader.ReadLineAsync()
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
$tray.Visible = $false
$tray.Dispose()
`;

// JavaScript for Automation: AppKit through osascript's Objective-C bridge.
// Menu bar symbols need macOS 11; older versions get a text icon.
const MACOS = String.raw`// claude-sync menu bar icon (see src/tray/helpers.ts)
ObjC.import("Cocoa");

const app = $.NSApplication.sharedApplication;
app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);

const stdout = $.NSFileHandle.fileHandleWithStandardOutput;
function send(message) {
  stdout.writeData($(message + "\n").dataUsingEncoding($.NSUTF8StringEncoding));
}

// The icon for each state, written next to this script by claude-sync
const DIR = __TRAY_DIR__;
const TEXT = { idle: "claude-sync", syncing: "claude-sync ⟳", attention: "claude-sync ⚠︎" };

let buffer = "";
function read(notification) {
  const data = notification.userInfo.objectForKey($.NSFileHandleNotificationDataItem);
  if (!data || data.isNil() || data.length === 0) {
    app.terminate(null);
    return;
  }
  buffer += $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    try {
      const message = JSON.parse(line);
      setState(message.state, message.tooltip);
      status.setTitle(message.status);
    } catch (error) {
      // Ignore a malformed line
    }
  }
  stdin.readInBackgroundAndNotify;
}

ObjC.registerSubclass({
  name: "ClaudeSyncTray",
  methods: {
    "open:": { types: ["void", ["id"]], implementation: () => send("open") },
    "sync:": { types: ["void", ["id"]], implementation: () => send("sync") },
    "quit:": { types: ["void", ["id"]], implementation: () => send("quit") },
    "read:": { types: ["void", ["id"]], implementation: (notification) => read(notification) },
  },
});
const handler = $.ClaudeSyncTray.alloc.init;

const item = $.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);
const menu = $.NSMenu.alloc.init;
menu.setAutoenablesItems(false);

const status = menu.addItemWithTitleActionKeyEquivalent("Starting…", null, "");
status.setEnabled(false);
menu.addItem($.NSMenuItem.separatorItem);
for (const [title, action, key] of [["Open claude-sync", "open:", "o"], ["Sync now", "sync:", "s"]]) {
  menu.addItemWithTitleActionKeyEquivalent(title, action, key).setTarget(handler);
}
menu.addItem($.NSMenuItem.separatorItem);
menu.addItemWithTitleActionKeyEquivalent("Quit claude-sync", "quit:", "q").setTarget(handler);
item.setMenu(menu);

function setState(state, tooltip) {
  const button = item.button;
  const known = TEXT[state] ? state : "idle";
  const image = $.NSImage.alloc.initWithContentsOfFile(DIR + "/icon-" + known + ".png");
  if (image && !image.isNil()) {
    // Menu bar icons are 18 points; the 64 px image keeps it sharp on Retina screens
    image.setSize($.NSMakeSize(18, 18));
    button.setImage(image);
    button.setTitle("");
  } else {
    button.setTitle(TEXT[known]);
  }
  button.setToolTip(tooltip || "claude-sync");
}
setState("idle", "claude-sync");

const stdin = $.NSFileHandle.fileHandleWithStandardInput;
$.NSNotificationCenter.defaultCenter.addObserverSelectorNameObject(
  handler, "read:", $.NSFileHandleReadCompletionNotification, stdin
);
stdin.readInBackgroundAndNotify;
app.run;
`;

// GTK with Ayatana AppIndicator (or the older AppIndicator), which most desktops show;
// GNOME needs the "AppIndicator and KStatusNotifierItem Support" extension
const LINUX = String.raw`# claude-sync tray icon (see src/tray/helpers.ts)
import json
import os
import sys

try:
    import gi

    gi.require_version("Gtk", "3.0")
    from gi.repository import GLib, Gtk

    for name in ("AyatanaAppIndicator3", "AppIndicator3"):
        try:
            gi.require_version(name, "0.1")
            AppIndicator = getattr(__import__("gi.repository", fromlist=[name]), name)
            break
        except (ImportError, ValueError, AttributeError):
            AppIndicator = None
    if AppIndicator is None:
        raise ImportError("no AppIndicator library")
except (ImportError, ValueError) as error:
    sys.stderr.write(
        "claude-sync needs python3-gi and Ayatana AppIndicator for a tray icon: %s\n" % error
    )
    sys.exit(3)

# The icon for each state, written next to this script by claude-sync
DIR = os.path.dirname(os.path.abspath(__file__))
ICONS = dict((state, os.path.join(DIR, "icon-%s.png" % state)) for state in ("idle", "syncing", "attention"))


def send(message):
    sys.stdout.write(message + "\n")
    sys.stdout.flush()


menu = Gtk.Menu()
status = Gtk.MenuItem(label="Starting…")
status.set_sensitive(False)
menu.append(status)
menu.append(Gtk.SeparatorMenuItem())
open_item = Gtk.MenuItem(label="Open claude-sync")
open_item.connect("activate", lambda _item: send("open"))
menu.append(open_item)
sync_item = Gtk.MenuItem(label="Sync now")
sync_item.connect("activate", lambda _item: send("sync"))
menu.append(sync_item)
menu.append(Gtk.SeparatorMenuItem())
quit_item = Gtk.MenuItem(label="Quit claude-sync")
quit_item.connect("activate", lambda _item: send("quit"))
menu.append(quit_item)
menu.show_all()

indicator = AppIndicator.Indicator.new(
    "claude-sync", ICONS["idle"], AppIndicator.IndicatorCategory.APPLICATION_STATUS
)
indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE)
indicator.set_title("claude-sync")
indicator.set_menu(menu)
# Middle click opens the dashboard; indicators show the menu on other clicks
indicator.set_secondary_activate_target(open_item)


def on_input(channel, condition):
    result, line, _length, _end = channel.read_line()
    if result != GLib.IOStatus.NORMAL or not line:
        Gtk.main_quit()
        return False
    try:
        message = json.loads(line)
        state = message.get("state")
        indicator.set_icon_full(ICONS.get(state, ICONS["idle"]), message.get("tooltip", ""))
        status.set_label(message.get("status", ""))
    except (ValueError, AttributeError):
        pass
    return True


channel = GLib.IOChannel.unix_new(sys.stdin.fileno())
GLib.io_add_watch(channel, GLib.PRIORITY_DEFAULT, GLib.IOCondition.IN | GLib.IOCondition.HUP, on_input)
Gtk.main()
`;
