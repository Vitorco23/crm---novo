import { describe, expect, it, vi } from "vitest";
import { ScopedWriteQueue, withRetry } from "@/shared/services/cloudWriteQueue";

describe("ScopedWriteQueue", () => {
  it("keeps writes for the same user/key in submission order", async () => {
    const queue = new ScopedWriteQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = queue.enqueue("user-a:p21_leads", async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
    });
    const second = queue.enqueue("user-a:p21_leads", async () => {
      events.push("second");
    });

    await vi.waitFor(() => expect(events).toEqual(["first:start"]));
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("does not serialize different users into the same scope", async () => {
    const queue = new ScopedWriteQueue();
    const events: string[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => { releaseA = resolve; });

    const writeA = queue.enqueue("user-a:p21_leads", async () => {
      events.push("a:start");
      await gateA;
      events.push("a:end");
    });
    const writeB = queue.enqueue("user-b:p21_leads", async () => {
      events.push("b");
    });

    await writeB;
    expect(events).toEqual(["a:start", "b"]);
    releaseA();
    await writeA;
  });

  it("continues after a failed write and retries transient failures", async () => {
    const queue = new ScopedWriteQueue();
    const sleep = vi.fn(async () => undefined);
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);

    await expect(queue.enqueue("user-a:p21_leads", () =>
      withRetry(operation, { attempts: 2, baseDelayMs: 10, sleep }),
    )).resolves.toBeUndefined();

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);

    await expect(queue.enqueue("user-a:p21_leads", async () => undefined))
      .resolves.toBeUndefined();
  });
});
