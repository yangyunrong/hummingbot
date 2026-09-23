import { test, expect } from "@playwright/test";

test("renders Toobit stale without collapsing healthy Bitget lane", async ({ page }) => {
  await page.route("**/api/runtime/venues", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          venue: "TOOBIT",
          runtimeState: "RUNNING",
          sourceAt: new Date().toISOString(),
          sourceAgeMs: 9500,
          stale: true,
          publicWsAgeMs: 9000,
          privateWsAgeMs: 9500,
          truthAgeMs: 9400,
          todayVolumeUsdt: 1200,
          makerVolumeUsdt: 1100,
          takerVolumeUsdt: 100,
          realizedPnlUsdt: -0.2,
          feesUsdt: -0.1,
          rebateUsdt: 0.15,
          fundingUsdt: 0,
          coreWearBps: -0.4,
          netWearBps: -0.1,
          activeOrders: 0,
          maxOrders: 10,
          netInventoryUsdt: 0,
          coverageDeficitUsdt: 0,
          latency: { sendToAckP50Ms: 20, sendToAckP95Ms: 30, sendToAckP99Ms: 40, eventLoopP99Ms: 0.5, gcPauseP99Ms: 0.1 }
        },
        {
          venue: "BITGET",
          runtimeState: "RUNNING",
          sourceAt: new Date().toISOString(),
          sourceAgeMs: 25,
          stale: false,
          publicWsAgeMs: 20,
          privateWsAgeMs: 22,
          truthAgeMs: 24,
          todayVolumeUsdt: 2300,
          makerVolumeUsdt: 2200,
          takerVolumeUsdt: 100,
          realizedPnlUsdt: 0.3,
          feesUsdt: -0.1,
          rebateUsdt: 0.2,
          fundingUsdt: 0,
          coreWearBps: 0.1,
          netWearBps: 0.3,
          activeOrders: 4,
          maxOrders: 10,
          netInventoryUsdt: -1,
          coverageDeficitUsdt: 0,
          latency: { sendToAckP50Ms: 18, sendToAckP95Ms: 28, sendToAckP99Ms: 36, eventLoopP99Ms: 0.4, gcPauseP99Ms: 0.05 }
        }
      ])
    })
  );

  await page.goto("/venues");
  await expect(page.getByTestId("venue-TOOBIT")).toContainText("STALE");
  await expect(page.getByTestId("venue-BITGET")).toContainText("RUNNING");
  await expect(page.getByTestId("venue-BITGET")).not.toContainText("STALE");
});
