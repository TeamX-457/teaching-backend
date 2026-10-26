/**
 * Lets listeners wait for the next caption instead of asking over and over. A request that finds nothing new waits
 * here and is answered the moment a caption arrives: instantly when the host's request landed on the same server,
 * and within `POLL_MS` otherwise. Many listeners of one session share ONE database check, not one each.
 */
type Waiter = { after: number; wake: () => void };
type Room = { waiters: Set<Waiter>; timer: ReturnType<typeof setInterval> | null; busy: boolean };

const POLL_MS = 350;
const rooms = new Map<string, Room>();

export type LatestSeq = (sessionId: string) => Promise<number>;

function room(id: string): Room {
  let r = rooms.get(id);
  if (!r) rooms.set(id, (r = { waiters: new Set(), timer: null, busy: false }));
  return r;
}

/** Called when a caption is saved on this server: wakes everyone waiting on that session straight away. */
export function announce(sessionId: string) {
  for (const w of rooms.get(sessionId)?.waiters ?? []) w.wake();
}

/**
 * Resolves true when a caption newer than `after` exists, or false after `waitMs`.
 * `latest` returns the newest caption number of the session (one cheap query).
 */
export function waitForCaption(sessionId: string, after: number, waitMs: number, latest: LatestSeq): Promise<boolean> {
  return new Promise((resolve) => {
    const r = room(sessionId);
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      r.waiters.delete(w);
      if (!r.waiters.size && r.timer) { clearInterval(r.timer); r.timer = null; rooms.delete(sessionId); }
      resolve(v);
    };
    const w: Waiter = { after, wake: () => finish(true) };
    const timeout = setTimeout(() => finish(false), Math.max(0, waitMs));
    r.waiters.add(w);
    if (!r.timer) {
      r.timer = setInterval(async () => {
        if (r.busy) return;
        r.busy = true;
        try {
          const seq = await latest(sessionId);
          for (const x of r.waiters) if (seq > x.after) x.wake();
        } catch { /* a failed check is retried on the next tick */ } finally { r.busy = false; }
      }, POLL_MS);
    }
  });
}

export const waitingCount = (sessionId: string) => rooms.get(sessionId)?.waiters.size ?? 0;
