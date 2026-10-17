/**
 * Works through items with at most `count` at once (BILDIRIM-DAGITICI): each lane takes the next item when
 * its last one is done, so items start in their order. A failure in one item is the caller's to catch.
 */
export async function inLanes<T>(items: readonly T[], count: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next] as T;
      next += 1;
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(count, items.length)) }, lane));
}
