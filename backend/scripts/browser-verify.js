import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const schema = "studio_test_" + randomBytes(6).toString("hex");
assert.match(schema, /^studio_test_[a-f0-9]{12}$/);
const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
let server, pool, vite, browser;
try {
  await database.query(
    (
      await readFile(new URL("../database/schema.sql", import.meta.url), "utf8")
    ).replace(/\bstudio\b/g, schema),
  );
  process.env.NODE_ENV = "test";
  process.env.CORS_ORIGINS = "http://localhost:15173";
  const { migrate } = await import("../database/migrate.js");
  await migrate(database, schema);
  process.env.DB_SCHEMA = schema;
  process.env.SETUP_TOKEN = randomBytes(24).toString("hex");
  const { app } = await import("../server.js");
  ({ pool } = await import("../database/pool.js"));
  server = app.listen(14000, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.on("listening", resolve);
    server.on("error", reject);
  });
  const frontend = fileURLToPath(new URL("../../frontend", import.meta.url));
  vite = await createServer({
    root: frontend,
    configFile: frontend + "/vite.config.js",
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(
        "http://127.0.0.1:14000/api",
      ),
    },
    server: {
      host: "127.0.0.1",
      port: 15173,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:14000" },
    },
  });
  await vite.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(10000);
  const errors = [];
  const apiRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:15173");
  await expect(
    page.getByRole("heading", { name: "Make it your studio" }),
  ).toBeVisible();
  const password = randomBytes(18).toString("hex");
  await page.getByLabel("Your name").fill("Studio Owner");
  await page.getByLabel("Setup token").fill(process.env.SETUP_TOKEN);
  await page.getByLabel("Email address").fill("browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByText("Total customers", { exact: true }),
  ).toBeVisible();
  const nav = async (name) =>
    page.locator("aside").getByRole("link", { name, exact: true }).click();
  await nav("Customers");
  await page.getByRole("button", { name: "Add customer" }).click();
  await page.getByLabel("Full name").fill("Meera Rao");
  await page.getByLabel("Mobile number").fill("9876543210");
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(
    page.getByRole("cell", { name: "Meera Rao", exact: true }),
  ).toBeVisible();
  await nav("Bookings");
  await page.getByRole("button", { name: "Add booking" }).click();
  await page
    .getByLabel("Customer", { exact: false })
    .selectOption({ label: "Meera Rao" });
  await page.getByLabel("Event type").selectOption({ label: "Wedding" });
  await page.getByLabel("Event date").fill("2026-12-12");
  await page.getByLabel("Event location").fill("Bluebell Hall");
  await page.getByLabel("Agreed amount").fill("25000");
  await page.getByRole("button", { name: "Save booking" }).click();
  await expect(
    page.getByRole("cell", { name: "Meera Rao", exact: true }),
  ).toBeVisible();
  await nav("Payments");
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByLabel("Booking", { exact: false }).selectOption({ index: 1 });
  await page.getByLabel("Amount (₹)", { exact: false }).fill("5000");
  await page.getByLabel("Payment method").selectOption("UPI");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(
    page.getByRole("cell", { name: "Meera Rao", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(
    page.getByRole("heading", { name: "PAYMENT RECEIPT", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav("Albums");
  await page.getByRole("button", { name: "Add album" }).click();
  await page.getByLabel("Booking", { exact: false }).selectOption({ index: 1 });
  await page.getByLabel("Album type").fill("Wedding story");
  await page.getByLabel("Size", { exact: false }).fill("12x18");
  await page.getByLabel("Number of pages").fill("30");
  await page.getByRole("button", { name: "Save album" }).click();
  await expect(
    page.getByRole("cell", { name: "Wedding story", exact: true }),
  ).toBeVisible();
  await nav("Expenses");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByRole("dialog").getByLabel("Category").selectOption("Travel");
  await page.getByLabel("Description").fill("Venue visit");
  await page.getByLabel("Amount (₹)", { exact: false }).fill("500");
  await page.getByLabel("Payment method").selectOption("Cash");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(
    page.getByRole("cell", { name: "Venue visit", exact: true }),
  ).toBeVisible();
  await nav("Reports");
  await expect(
    page.getByRole("cell", { name: "Net cash balance", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  assert.ok((await download).suggestedFilename().endsWith(".csv"));
  await nav("Settings");
  await page.getByLabel("Studio name").fill("Blue Hour Studio");
  await page.getByRole("button", { name: "Save studio details" }).click();
  await expect(page.getByText("Studio details saved.")).toBeVisible();
  await nav("Users");
  await expect(
    page.getByRole("cell", { name: "Studio Owner", exact: true }),
  ).toBeVisible();
  await nav("Dashboard");
  await nav("Invoices");
  await page
    .getByRole("button", { name: "Create invoice", exact: true })
    .click();
  await page.getByLabel("Booking", { exact: false }).selectOption({ index: 1 });
  await expect(page.getByLabel("Unit price (₹)")).toHaveValue("25000.00");
  await page
    .getByRole("button", { name: "Issue invoice", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /^INV-/ })).toBeVisible();
  await page.getByRole("button", { name: "Preview / print PDF" }).click();
  await expect(page.locator('iframe[title$="PDF preview"]')).toHaveAttribute(
    "src",
    /^blob:/,
  );
  const invoiceDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  assert.ok((await invoiceDownload).suggestedFilename().startsWith("INV-"));
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "View invoice", exact: true }).click();
  await page.getByRole("button", { name: "Void invoice", exact: true }).click();
  await page.getByLabel("Reason").fill("Browser test correction");
  await page.getByRole("button", { name: "Confirm void", exact: true }).click();
  await expect(page.getByText("Voided: Browser test correction")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav("Payments");
  await page
    .getByRole("button", { name: "Download receipt PDF", exact: true })
    .click();
  await expect(page.locator('iframe[title$="PDF preview"]')).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav("Equipment");
  await page
    .getByRole("button", { name: "Add equipment", exact: true })
    .click();
  await page.getByLabel("Asset code").fill("UI-CAM-01");
  await page.getByLabel("Equipment name").fill("Browser Camera");
  await page.getByRole("dialog").getByLabel("Category").selectOption("Cameras");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "UI-CAM-01", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Assign equipment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Equipment", { exact: false })
    .selectOption({ index: 1 });
  await page.getByLabel("Booking", { exact: false }).selectOption({ index: 1 });
  await page.getByLabel("Expected return date").fill("2026-12-12");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Assignments", exact: true }).click();
  await page.getByRole("button", { name: "Return", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Returned", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add maintenance", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Equipment", { exact: false })
    .selectOption({ index: 1 });
  await page.getByLabel("Maintenance type").fill("Cleaning");
  await page.getByLabel("Description", { exact: false }).fill("Lens cleaning");
  await page.getByLabel("Maintenance cost").fill("100");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Maintenance", exact: true }).click();
  await page.getByRole("button", { name: "Record / link expense" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Expense #/)).toBeVisible();
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Status").selectOption("Completed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Completed", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page
    .getByRole("button", { name: "View equipment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Assignment history" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retire equipment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm retirement", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Retired", exact: true }),
  ).toBeVisible();
  await nav("Dashboard");
  await expect(page.getByText("Money in, money out")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "12 Dec 2026", exact: true }),
  ).toBeVisible();
  await mkdir(new URL("../../test-results/", import.meta.url), {
    recursive: true,
  });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("Money in, money out")).toBeVisible();
  await page.screenshot({
    path: fileURLToPath(
      new URL("../../test-results/dashboard-dark.png", import.meta.url),
    ),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: fileURLToPath(
      new URL("../../test-results/dashboard-desktop.png", import.meta.url),
    ),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await nav("Customers");
  await expect(
    page.getByRole("heading", { name: "Customers", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Meera Rao", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const box = await page.locator("aside").boundingBox();
      return !box || box.x + box.width <= 1;
    })
    .toBe(true);
  await page.screenshot({
    path: fileURLToPath(
      new URL("../../test-results/customers-mobile.png", import.meta.url),
    ),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    "Mobile page should not overflow",
  );
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await nav("Users");
  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByLabel("Full name").fill("First Login Staff");
  await page.getByLabel("Email address").fill("firstlogin@example.test");
  await page.getByRole("button", { name: "Save user" }).click();
  await expect(
    page.getByRole("heading", { name: "User created", exact: true }),
  ).toBeVisible();
  const temporaryPassword = await page
    .locator(".temporary-credentials input")
    .inputValue();
  assert.ok(temporaryPassword.length >= 12);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.getByRole("button", { name: "Open profile" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email address").fill("firstlogin@example.test");
  await page.getByLabel("Password", { exact: true }).fill(temporaryPassword);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Set your own password" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Set your own password" }),
  ).toBeVisible();
  await page
    .getByLabel("Temporary password", { exact: true })
    .fill(temporaryPassword);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password + "mismatch");
  await page
    .getByRole("button", { name: "Change password and sign in" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "New passwords do not match",
  );
  await page.getByLabel("Confirm new password").fill(password);
  await page
    .getByRole("button", { name: "Change password and sign in" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("firstlogin@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Set your own password" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeVisible();
  assert.deepEqual(errors, [], "Browser runtime errors");
  assert.ok(apiRequests.length > 0);
  assert.ok(
    apiRequests.every(
      (url) =>
        url.startsWith("http://127.0.0.1:14000/api/") &&
        !url.includes("/api/api/"),
    ),
    "All API requests must reach the API host with exactly one /api prefix",
  );
  console.log(
    "PASS: existing module forms; invoice issue/PDF download/void; receipt PDF; equipment create/assign/return/maintenance/expense/retire; profile/logout; desktop/mobile; first-login password changes; no runtime errors.",
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (pool) await pool.end();
  await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await database.end();
}
