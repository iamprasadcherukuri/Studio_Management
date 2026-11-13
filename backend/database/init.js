import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pool } from "./pool.js";
try {
  await pool.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  if (process.argv.includes("--demo"))
    await pool.query(
      await readFile(new URL("./seed.sql", import.meta.url), "utf8"),
    );
  console.log("Schema initialized successfully.");
} finally {
  await pool.end();
}
