import type { LastSync } from "../utils/manifest.js";

/** Which icon the tray shows: a cloud, with a sync badge or a warning badge */
export type TrayState = "idle" | "syncing" | "attention";

export interface TrayStatus {
  state: TrayState;
  /** First line of the tray menu */
  status: string;
  /** Hover text; Windows shows at most 63 characters */
  tooltip: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function trayStatus(syncing: boolean, lastSync: LastSync | null, setUp = true): TrayStatus {
  let state: TrayState = "idle";
  let status = "Not synced yet";

  if (!setUp) {
    return { state: "attention", status: "Not set up yet", tooltip: "claude-sync: click to connect your storage" };
  } else if (syncing) {
    [state, status] = ["syncing", "Syncing…"];
  } else if (lastSync?.error) {
    [state, status] = ["attention", "The last sync failed"];
  } else if (lastSync?.warnings.length) {
    [state, status] = ["attention", `Synced with ${plural(lastSync.warnings.length, "warning")}`];
  } else if (lastSync) {
    const time = new Date(lastSync.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    status = `Up to date · synced ${time}`;
  }

  return { state, status, tooltip: `claude-sync: ${status}`.slice(0, 63) };
}
