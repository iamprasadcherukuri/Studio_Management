import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { readSettings } from "./settings.js";
dotenv.config({ path: new URL("../.env", import.meta.url), quiet: true });
export const databaseTarget =
  process.env.DATABASE_TARGET ||
  (!process.env.DATABASE_URL && process.env.SUPABASE_DATABASE_URL
    ? "supabase"
    : "local");
if (!["local", "supabase"].includes(databaseTarget))
  throw new Error("DATABASE_TARGET must be local or supabase");
if (databaseTarget === "supabase")
  dotenv.config({
    path: new URL("../.env.supabase", import.meta.url),
    quiet: true,
  });
if (databaseTarget === "local" && !process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for the selected database target");
if (
  databaseTarget === "supabase" &&
  !process.env.SUPABASE_DATABASE_URL &&
  !process.env.DATABASE_URL
)
  throw new Error(
    "SUPABASE_DATABASE_URL or DATABASE_URL is required for Supabase",
  );
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error("JWT_SECRET must contain at least 32 characters");
export const config = readSettings(process.env);
export function databaseOptions() {
  if (databaseTarget === "local")
    return { connectionString: process.env.DATABASE_URL };
  let url;
  try {
    url = new URL(
      process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
    );
  } catch {
    throw new Error("Invalid Supabase PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Use a PostgreSQL connection URL");
  if (["disable", "no-verify"].includes(url.searchParams.get("sslmode")))
    throw new Error("Supabase TLS verification cannot be disabled");
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"])
    url.searchParams.delete(key);
  const path =
    process.env.SUPABASE_CA_PATH ||
    new URL("../certs/supabase-ca.crt", import.meta.url);
  let ca = process.env.SUPABASE_CA_CERT?.replaceAll("\\n", "\n");
  if (!ca)
    try {
      ca = readFileSync(path, "utf8");
    } catch {
      throw new Error(
        "Set SUPABASE_CA_CERT or provide backend/certs/supabase-ca.crt",
      );
    }
  if (!ca.includes("-----BEGIN CERTIFICATE-----"))
    throw new Error("Supabase CA file must contain a PEM certificate");
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ca },
  };
}
