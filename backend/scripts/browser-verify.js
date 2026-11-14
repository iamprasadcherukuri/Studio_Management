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
  await page
    .getByRole("dialog")
    .getByLabel(/^Title/)
    .selectOption("Ms.");
  await page
    .getByRole("dialog")
    .getByLabel(/^Gender/)
    .selectOption("Female");
  await page.getByLabel("Full name").fill("Meera Rao");
  await page.getByLabel("Mobile number").fill("9876543210");
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(
    page.getByRole("cell", { name: "Meera Rao", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit customer", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByLabel(/^Title/)).toHaveValue(
    "Ms.",
  );
  await expect(page.getByRole("dialog").getByLabel(/^Gender/)).toHaveValue(
    "Female",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await nav("Bookings");
  await database.query(
    "INSERT INTO customers(name,mobile) VALUES('Suresh Reddy','9123456780')",
  );
  const beforeCustomerSearch = Number(
    (await database.query("SELECT count(*) FROM customers")).rows[0].count,
  );
  await page.getByRole("button", { name: "Add booking" }).click();
  const customerSearch = page.getByRole("combobox", {
    name: "Search Customer",
  });
  const customerBounds = await customerSearch.boundingBox(),
    eventBounds = await page.getByLabel("Event type").boundingBox();
  assert.ok(
    Math.abs(customerBounds.y - eventBounds.y) <= 1,
    "Customer and event inputs must align",
  );
  assert.ok(
    Math.abs(customerBounds.height - eventBounds.height) <= 1,
    "Customer and event inputs must have matching heights",
  );
  for (const query of ["Meera Rao", "Rao", "9876543210", "9876"]) {
    await customerSearch.fill(query);
    await expect(
      page.getByRole("option", { name: "Meera Rao — 9876543210" }),
    ).toBeVisible();
  }
  await customerSearch.press("ArrowDown");
  await customerSearch.press("ArrowUp");
  await customerSearch.press("Enter");
  await expect(customerSearch).toHaveValue("Meera Rao — 9876543210");
  await customerSearch.fill("No such customer");
  await expect(
    page.getByText("No customers found", { exact: true }),
  ).toBeVisible();
  assert.equal(
    await customerSearch.evaluate((node) => node.checkValidity()),
    false,
  );
  await customerSearch.press("Escape");
  await expect(customerSearch).toHaveAttribute("aria-expanded", "false");
  await customerSearch.fill("9123");
  await page.getByRole("option", { name: "Suresh Reddy — 9123456780" }).click();
  await expect(customerSearch).toHaveValue("Suresh Reddy — 9123456780");
  await customerSearch.fill("Meera");
  await page.getByRole("option", { name: "Meera Rao — 9876543210" }).click();
  await page.getByLabel("Event type").selectOption({ label: "Wedding" });
  await page.getByLabel("Event date").fill("2026-12-12");
  await page.getByLabel("Event location").fill("Bluebell Hall");
  await page.getByLabel("Total booking amount").fill("25000");
  await page.getByRole("button", { name: "Save booking" }).click();
  await expect(
    page.getByRole("cell", { name: "Meera Rao", exact: true }),
  ).toBeVisible();
  const selectedCustomer = (
    await database.query("SELECT id FROM customers WHERE mobile='9876543210'")
  ).rows[0];
  assert.equal(
    (
      await database.query(
        "SELECT customer_id FROM bookings WHERE location='Bluebell Hall'",
      )
    ).rows[0].customer_id,
    selectedCustomer.id,
  );
  assert.equal(
    Number(
      (await database.query("SELECT count(*) FROM customers")).rows[0].count,
    ),
    beforeCustomerSearch,
  );
  await page.getByRole("button", { name: "Edit booking" }).click();
  await expect(
    page.getByRole("combobox", { name: "Search Customer" }),
  ).toHaveValue("Meera Rao — 9876543210");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav("Payments");
  await page.getByRole("button", { name: "Add payment" }).click();
  await page.getByLabel("Booking", { exact: false }).selectOption({ index: 1 });
  await page.getByLabel("Amount (₹)", { exact: false }).fill("5000");
  await page.getByLabel(/^Additional discount type/).selectOption("PERCENTAGE");
  await page.getByLabel(/^Additional discount value/).fill("4");
  await expect(
    page
      .locator(".payment-discount-preview")
      .getByText("Additional discount", { exact: true })
      .locator("..")
      .locator("dd"),
  ).toContainText("1,000");
  await page.getByLabel(/^Additional discount type/).selectOption("FIXED");
  await page.getByLabel(/^Additional discount value/).fill("1000");
  await expect(
    page
      .locator(".payment-discount-preview")
      .getByText("Balance after payment", { exact: true })
      .locator("..")
      .locator("dd"),
  ).toContainText("19,000");
  await page.getByLabel("Payment method").selectOption("UPI");
  await page.getByRole("button", { name: "Save receipt" }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  assert.equal(
    (
      await database.query(
        "SELECT payment_discount_amount FROM payments ORDER BY id DESC LIMIT 1",
      )
    ).rows[0].payment_discount_amount,
    "1000.00",
  );
  await expect(
    page.getByRole("cell", { name: "Meera Rao", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(page.locator('iframe[title$="PDF preview"]')).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav("Albums");
  await nav("Payments");
  await page.getByRole("button", { name: "Reverse / history" }).click();
  await page.getByLabel("Reversal amount").fill("250");
  await page.getByLabel("Reason", { exact: true }).fill("Browser correction");
  await page.getByRole("button", { name: "Confirm reversal" }).click();
  await expect(
    page.getByText(
      "Payment reversal recorded. Net receipts and outstanding balances are updated.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reverse / history" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("cell", { name: "Browser correction", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav("Albums");
  await page.getByRole("button", { name: "Add album" }).click();
  await page.getByLabel("Booking", { exact: false }).selectOption({ index: 1 });
  await page.getByLabel("Album type").selectOption("Wedding Album");
  await page.getByLabel("Size", { exact: false }).selectOption("12×18");
  await page.getByLabel("Number of pages").fill("30");
  await page.getByRole("button", { name: "Save album" }).click();
  await expect(
    page.getByRole("cell", { name: "Wedding Album", exact: true }),
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
  const settingsSections = page.locator(".settings-section");
  await expect(settingsSections).toHaveCount(4);
  for (const name of [
    "Studio Profile",
    "Master Management",
    "Packages",
    "Staff",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Studio name")).toBeHidden();
  const profileToggle = page.getByRole("button", {
    name: "Studio Profile",
    exact: true,
  });
  await profileToggle.focus();
  await profileToggle.press("Enter");
  await page.getByLabel("Studio name").fill("Blue Hour Studio");
  await profileToggle.click();
  await expect(page.getByLabel("Studio name")).toBeHidden();
  await profileToggle.click();
  await expect(page.getByLabel("Studio name")).toHaveValue("Blue Hour Studio");
  await page.getByRole("button", { name: "Packages", exact: true }).click();
  const staffToggle = page.getByRole("button", { name: "Staff", exact: true });
  await staffToggle.focus();
  await staffToggle.press("Space");
  await expect(staffToggle).toHaveAttribute("aria-expanded", "true");
  await expect(profileToggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Packages", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("button", { name: "Master Management", exact: true })
    .click();
  await page.getByRole("button", { name: "Save studio details" }).click();
  await expect(page.getByText("Studio details saved.")).toBeVisible();
  await page
    .getByRole("button", { name: "Add staff member", exact: true })
    .click();
  const staffDialog = page.getByRole("dialog");
  await staffDialog.getByLabel("Staff name").fill("Local Photographer");
  await staffDialog.getByLabel("Mobile", { exact: true }).fill("9876543210");
  await expect(
    staffDialog.getByLabel("Mobile", { exact: true }),
  ).toHaveAttribute("maxlength", "10");
  await staffDialog.getByLabel("Date of birth").fill("1990-01-15");
  await staffDialog
    .getByLabel("Email address")
    .fill("photographer@example.test");
  await staffDialog.getByLabel(/^Address/).fill("Hyderabad");
  await staffDialog
    .getByRole("button", { name: "Save staff member", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "photographer@example.test", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Master Management" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add entity", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Entity name")
    .fill("Delivery Options");
  await expect(
    page.getByRole("dialog").getByLabel("Generated code"),
  ).toHaveValue("DELIVERY_OPTIONS");
  await page.getByRole("button", { name: "Save master", exact: true }).click();
  await expect(page.getByLabel("Master entity")).toHaveValue(/\d+/);
  await page.getByRole("button", { name: "Add value", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Value name").fill("Home Delivery");
  await expect(
    page.getByRole("dialog").getByLabel("Generated code"),
  ).toHaveValue("HOME_DELIVERY");
  await page.getByRole("button", { name: "Save master", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "HOME_DELIVERY", exact: true }),
  ).toBeVisible();
  const masterRow = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "HOME_DELIVERY", exact: true }),
  });
  await masterRow.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Value name")
    .fill("Courier Delivery");
  await expect(
    page.getByRole("dialog").getByLabel("Generated code"),
  ).toHaveValue("HOME_DELIVERY");
  await page.getByRole("button", { name: "Save master", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Courier Delivery", exact: true }),
  ).toBeVisible();
  await masterRow
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await expect(
    masterRow.getByRole("cell", { name: "Inactive", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search entities").fill("");
  await expect(
    page
      .getByLabel("Master entity")
      .locator("option")
      .filter({ hasText: "Album Type" }),
  ).toHaveCount(1);
  await page.getByLabel("Master entity").selectOption({ label: "Album Type" });
  await expect(
    page.getByRole("cell", { name: "Wedding Album", exact: true }),
  ).toBeVisible();
  await mkdir(new URL("../../test-results/", import.meta.url), {
    recursive: true,
  });
  await page.locator(".master-management").screenshot({
    path: new URL(
      "../../test-results/master-management.png",
      import.meta.url,
    ).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  });
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
  await page.getByRole("dialog").getByLabel("Category").selectOption("Camera");
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
  const upcomingBooking = page.getByRole("link", {
    name: "View booking for Meera Rao",
    exact: true,
  });
  await upcomingBooking.focus();
  await upcomingBooking.press("Enter");
  await expect(page).toHaveURL(/\/bookings\?booking=\d+/);
  await expect(
    page.getByRole("heading", { name: "Booking information", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Bluebell Hall", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("dialog").getByText("Bluebell Hall", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page).toHaveURL(/\/bookings$/);
  await nav("Dashboard");
  await expect(page.getByText("Money in, money out")).toBeVisible();
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
  let temporaryPassword = await page
    .locator(".temporary-credentials input")
    .inputValue();
  assert.ok(temporaryPassword.length >= 12);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const staffRow = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "First Login Staff", exact: true }),
  });
  await staffRow
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await page
    .getByLabel("Your administrator password")
    .fill("incorrect-password");
  await page.getByRole("button", { name: "Confirm password reset" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Your current password is incorrect",
  );
  await page.getByLabel("Your administrator password").fill(password);
  await page.getByRole("button", { name: "Confirm password reset" }).click();
  await expect(
    page.getByRole("heading", { name: "Password reset", exact: true }),
  ).toBeVisible();
  temporaryPassword = await page
    .locator(".temporary-credentials input")
    .inputValue();
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
