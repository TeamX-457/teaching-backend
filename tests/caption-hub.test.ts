import { describe, expect, it } from "bun:test";
import { announce, waitForCaption, waitingCount } from "@/services/caption-hub";

describe("waiting for the next caption", () => {
  it("answers at once when a caption is announced on this server", async () => {
    const started = Date.now();
    const p = waitForCaption("s1", 0, 5_000, async () => 0);
    setTimeout(() => announce("s1"), 20);
    expect(await p).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
    expect(waitingCount("s1")).toBe(0);
  });

  it("answers within a moment when the caption arrived through another server", async () => {
    let seq = 3;
    const p = waitForCaption("s2", 3, 5_000, async () => seq);
    setTimeout(() => { seq = 4; }, 50);
    expect(await p).toBe(true);
  });

  it("gives up empty-handed after the wait, and cleans up", async () => {
    expect(await waitForCaption("s3", 0, 60, async () => 0)).toBe(false);
    expect(waitingCount("s3")).toBe(0);
  });

  it("shares one database check between many listeners of one session", async () => {
    let checks = 0;
    const latest = async () => { checks++; return 0; };
    const waiting = Array.from({ length: 200 }, () => waitForCaption("s4", 0, 1_000, latest));
    expect(waitingCount("s4")).toBe(200);
    await Promise.all(waiting);
    // 200 listeners over one second is about three checks, not two hundred
    expect(checks).toBeLessThan(8);
  });

  it("only wakes the sessions that have news", async () => {
    const a = waitForCaption("quiet", 0, 150, async () => 0);
    const b = waitForCaption("busy", 0, 2_000, async () => 0);
    announce("busy");
    expect(await b).toBe(true);
    expect(await a).toBe(false);
  });
});
