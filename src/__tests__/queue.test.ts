import { describe, it, expect } from "bun:test";
import { createScope, type Lite } from "@pumped-fn/lite";
import { queueAtom, BackpressureError } from "../atoms/queue";
import { queueConfigTag, logLevelTag, nodeEnvTag } from "../config/tags";

describe("Queue Atom (c3-102)", () => {
  const baseTags = [
    logLevelTag("info"),
    nodeEnvTag("test"),
  ];

  it("acquire() succeeds when slots available -> returns release function", async () => {
    const scope = createScope({
      tags: [
        ...baseTags,
        queueConfigTag({ maxConcurrent: 2, maxWaiting: 2 }),
      ],
    });

    const queue = await scope.resolve(queueAtom);
    const release = await queue.acquire();

    expect(typeof release).toBe("function");

    // Release to clean up
    release();
    await scope.dispose();
  });

  it("acquire() waits when no slots, resolves when released", async () => {
    const scope = createScope({
      tags: [
        ...baseTags,
        queueConfigTag({ maxConcurrent: 1, maxWaiting: 2 }),
      ],
    });

    const queue = await scope.resolve(queueAtom);
    
    // Fill the slot
    const release1 = await queue.acquire();
    
    // Next acquire should wait
    let acquired2 = false;
    const p2 = queue.acquire().then((release) => {
      acquired2 = true;
      return release;
    });

    expect(acquired2).toBe(false);
    
    // Release the first one
    release1();
    
    // Wait for p2 to resolve
    const release2 = await p2;
    expect(acquired2).toBe(true);

    release2();
    await scope.dispose();
  });

  it("acquire() throws BackpressureError when wait queue full", async () => {
    const scope = createScope({
      tags: [
        ...baseTags,
        queueConfigTag({ maxConcurrent: 1, maxWaiting: 1 }),
      ],
    });

    const queue = await scope.resolve(queueAtom);

    // 1. Take the only concurrent slot
    const release1 = await queue.acquire();
    
    // 2. Fill the only waiting slot
    const p2 = queue.acquire(); // Pending
    
    // 3. This should exceed maxWaiting
    // We expect this to throw BackpressureError
    let error: any;
    try {
      await queue.acquire();
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeInstanceOf(BackpressureError);
    expect(error.message).toBe("Queue is full");

    // Cleanup
    release1();
    (await p2)();
    await scope.dispose();
  });

  it("release() signals waiting requests (FIFO)", async () => {
    const scope = createScope({
      tags: [
        ...baseTags,
        queueConfigTag({ maxConcurrent: 1, maxWaiting: 5 }),
      ],
    });

    const queue = await scope.resolve(queueAtom);

    // Fill slot
    const release1 = await queue.acquire();

    const order: number[] = [];
    
    const p2 = queue.acquire().then((r) => {
      order.push(2);
      return r;
    });
    
    const p3 = queue.acquire().then((r) => {
      order.push(3);
      return r;
    });

    // Release 1, should trigger 2
    release1();
    const release2 = await p2;
    
    // Release 2, should trigger 3
    release2();
    const release3 = await p3;

    expect(order).toEqual([2, 3]);

    release3();
    await scope.dispose();
  });

  it("Cleanup rejects all waiters with error", async () => {
    const scope = createScope({
      tags: [
        ...baseTags,
        queueConfigTag({ maxConcurrent: 1, maxWaiting: 5 }),
      ],
    });

    const queue = await scope.resolve(queueAtom);
    
    // Fill slot
    await queue.acquire();
    
    // Waiter
    const p2 = queue.acquire();
    
    let error: any;
    p2.catch((e) => {
      error = e;
    });

    await scope.dispose();
    
    // Wait a tick for rejection to propagate
    await new Promise(r => setTimeout(r, 0));

    expect(error).toBeDefined();
    expect(error.message).toContain("Queue destroyed"); // Or whatever message we decide
  });
});
