/** How long conversations stay quiet before the icon syncs them */
export const IDLE_MS = 5 * 60_000;
/** After a sync when idle fails, how long until the icon tries again */
export const RETRY_MS = 15 * 60_000;

export interface IdleSync {
  /** The newest change a sync when idle already took care of */
  handled: number;
  /** No new attempt before this, after a failed one */
  retryAt: number;
}

/**
 * Whether the icon should sync now: something changed since the last sync, nothing
 * has been written for IDLE_MS, and that change wasn't synced already. A change a sync
 * leaves behind (a file too big for the storage, say) isn't retried every minute.
 */
export function idleSyncDue(lastChange: number, idle: IdleSync, now = Date.now()): boolean {
  return lastChange > idle.handled && now - lastChange >= IDLE_MS && now >= idle.retryAt;
}
