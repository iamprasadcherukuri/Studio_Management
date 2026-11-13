import dotenv from "dotenv";
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";
dotenv.config({
  path: new URL("../.env.supabase", import.meta.url),
  quiet: true,
});
if (!process.env.SUPABASE_DATABASE_URL && !process.env.DATABASE_URL)
  throw new Error("Configure SUPABASE_DATABASE_URL in backend/.env.supabase");
const url = new URL(
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
);
if (["disable", "no-verify"].includes(url.searchParams.get("sslmode")))
  throw new Error("TLS verification cannot be disabled");
for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"])
  url.searchParams.delete(key);
const override = process.argv.find((v) => v.startsWith("--database="));
if (override) url.pathname = "/" + override.split("=")[1];
const certPath =
  process.env.SUPABASE_CA_PATH ||
  new URL("../certs/supabase-ca.crt", import.meta.url);
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: {
    rejectUnauthorized: true,
    ...(process.env.SUPABASE_CA_CERT
      ? { ca: process.env.SUPABASE_CA_CERT.replaceAll("\\n", "\n") }
      : existsSync(certPath)
        ? { ca: readFileSync(certPath, "utf8") }
        : {}),
  },
  connectionTimeoutMillis: 15000,
  query_timeout: 15000,
});
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const info = (
    await client.query(
      "SELECT current_database() AS database,current_user AS role",
    )
  ).rows[0];
  const tls = (
    await client.query(
      "SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
    )
  ).rows[0];
  const tables = (
    await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='studio' AND table_type='BASE TABLE' ORDER BY table_name",
    )
  ).rows;
  console.log(
    JSON.stringify(
      {
        connection: "verified",
        ...info,
        client_to_pool_tls: {
          verified: client.connection.stream.authorized,
          protocol: client.connection.stream.getProtocol(),
        },
        pool_to_database_tls: tls,
        studio_tables: tables.map((t) => t.table_name),
      },
      null,
      2,
    ),
  );
  await client.query("ROLLBACK");
} catch (error) {
  console.error(
    `Cloud verification failed (${error.code || error.name}): ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
