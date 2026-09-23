import { test, expect } from "@playwright/test";

test("renders unknown state with no fabricated metrics", async ({ page }) => {
  await page.route("**/api/runtime/venues", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/runtime/symbols", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/alerts?active=true", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );

  await page.goto("/");
  await expect(page.getByText("No runtime data")).toBeVisible();
  await expect(page.getByText(/29,822/)).toHaveCount(0);
  await expect(page.getByText(/18,559/)).toHaveCount(0);
  await expect(page.getByText(/48,381/)).toHaveCount(0);
});
