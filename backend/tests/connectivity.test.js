import test from "node:test";
import assert from "node:assert/strict";
import { readSettings } from "../config/settings.js";
import { resolveApiBase } from "../../frontend/src/services/api-base.js";
import { spawnSync } from "node:child_process";
test("API URL accepts backend origin or /api without duplicating prefixes", () => {
  assert.equal(
    resolveApiBase("https://example.onrender.com"),
    "https://example.onrender.com/api",
  );
  assert.equal(
    resolveApiBase("https://example.onrender.com/api/"),
    "https://example.onrender.com/api",
  );
  assert.equal(resolveApiBase(), " /api".trim());
  for (const url of [
    "https://example.com/api/api",
    "//example.com",
    "https://user:secret@example.com",
    "https://example.com/api?token=value",
  ])
    assert.throws(() => resolveApiBase(url));
});
test("Supabase selects its own URL and verified CA without requiring a local URL", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import {databaseOptions} from './config/env.js';const options=databaseOptions();console.log(JSON.stringify({verified:options.ssl.rejectUnauthorized,hasCA:!!options.ssl.ca,selected:options.connectionString.includes('db.example')}));",
    ],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_TARGET: "supabase",
        DATABASE_URL: "",
        SUPABASE_DATABASE_URL:
          "postgresql://user:placeholder@db.example:5432/postgres?sslmode=require",
        JWT_SECRET: "test-only-secret-that-is-at-least-32-characters",
        SUPABASE_CA_CERT:
          "-----BEGIN CERTIFICATE-----\nplaceholder\n-----END CERTIFICATE-----",
        CORS_ORIGINS: "https://front.example",
        FRONTEND_URL: "",
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    verified: true,
    hasCA: true,
    selected: true,
  });
});
test("production CORS uses explicit origins and exact matches, preserving legacy alias", () => {
  const settings = readSettings({
    NODE_ENV: "production",
    FRONTEND_URL: "https://studio.example/",
    RENDER: "true",
  });
  assert.deepEqual(settings.origins, ["https://studio.example"]);
  assert.equal(settings.proxyHops, 1);
  assert.equal(
    readSettings({ FRONTEND_ORIGIN: "http://localhost:5173" }).origin,
    "http://localhost:5173",
  );
  assert.deepEqual(
    readSettings({ CORS_ORIGINS: "https://one.example,https://two.example" })
      .origins,
    ["https://one.example", "https://two.example"],
  );
  for (const env of [
    { NODE_ENV: "production" },
    { FRONTEND_URL: "https://*.vercel.app" },
    { FRONTEND_URL: "https://example.com/path" },
    { PORT: "bad" },
    { TRUST_PROXY_HOPS: "true" },
  ])
    assert.throws(() => readSettings(env));
});
