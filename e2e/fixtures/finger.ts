import type { Page } from "@playwright/test";

/**
 * A finger's swipe from (x, y) of the screen, dx (and dy) px in eight moves over 225 ms of the finger's own time.
 * Every touch event carries its own timestamp: the page reads the finger's time (event.timeStamp; a tab swipe
 * counts up to 900 ms, useTabSwipe), so a busy machine that is slow to deliver the events does not make the
 * finger slow. Without it a loaded CI machine stretched a 200 ms swipe past 900 ms (CI 39538240966).
 * `lag` holds each move back that long, as a loaded machine does (the helper's own proof).
 */
export async function swipeAt(page: Page, x: number, y: number, dx: number, dy = 0, lag = 0) {
  const cdp = await page.context().newCDPSession(page);
  const start = Date.now() / 1000;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }], timestamp: start });
  for (let step = 1; step <= 8; step++) {
    if (lag) await page.waitForTimeout(lag);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * step) / 8, y: y + (dy * step) / 8 }],
      timestamp: start + (step * 25) / 1000,
    });
    await page.waitForTimeout(25);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: start + 0.225 });
  await cdp.detach();
}
