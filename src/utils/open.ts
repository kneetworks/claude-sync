import { spawn } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Start a program without waiting for it; false if it couldn't be started
 */
function launch(command: string, args: string[], hide: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true, windowsHide: hide });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

/**
 * Open a link in the default browser, or a folder in the file manager
 */
export function openWithSystem(url: string): Promise<boolean> {
  if (process.platform === "win32") return launch("cmd", ["/c", "start", "", url], true);
  if (process.platform === "darwin") return launch("open", [url], false);
  return launch("xdg-open", [url], false);
}

function chromiumBrowsers(): string[] {
  if (process.platform === "win32") {
    const roots = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA];
    return roots
      .filter((root): root is string => !!root)
      .flatMap((root) => [
        path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      ]);
  }
  if (process.platform === "darwin") {
    return ["Google Chrome", "Microsoft Edge", "Chromium", "Brave Browser"].map(
      (app) => `/Applications/${app}.app/Contents/MacOS/${app}`
    );
  }
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"];
  return names.flatMap((name) => dirs.map((dir) => path.join(dir, name)));
}

/**
 * Open the dashboard in a window of its own, like a desktop sync app's settings,
 * with a Chromium-based browser's app mode; otherwise in a browser tab
 */
export async function openApp(url: string): Promise<boolean> {
  const browser = chromiumBrowsers().find((file) => fs.existsSync(file));
  // Not hidden: a browser that isn't running yet would open its window hidden
  if (browser && (await launch(browser, [`--app=${url}`, "--window-size=1000,780"], false))) {
    return true;
  }
  return openWithSystem(url);
}
