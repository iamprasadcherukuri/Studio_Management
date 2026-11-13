import "dotenv/config";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
export const databaseTarget = process.env.DATABASE_TARGET || "local";
if (!["local", "supabase"].includes(databaseTarget))
  throw new Error("DATABASE_TARGET must be local or supabase");
if (databaseTarget === "supabase")
  dotenv.config({
    path: new URL("../.env.supabase", import.meta.url),
    quiet: true,
  });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required in backend/.env");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error("JWT_SECRET must contain at least 32 characters");
export const config = {
  port: Number(process.env.PORT || 4000),
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  secret: process.env.JWT_SECRET,
  schema: process.env.DB_SCHEMA || "studio",
};
if (!/^[a-z_][a-z0-9_]*$/.test(config.schema))
  throw new Error("Invalid DB_SCHEMA");
export function databaseOptions() {
  if (databaseTarget === "local")
    return { connectionString: process.env.DATABASE_URL };
  if (!process.env.SUPABASE_DATABASE_URL)
    throw new Error(
      "SUPABASE_DATABASE_URL is required in backend/.env.supabase",
    );
  const url = new URL(process.env.SUPABASE_DATABASE_URL);
  if (url.searchParams.has("sslmode") || url.searchParams.has("sslrootcert"))
    throw new Error(
      "Remove SSL query parameters; verified TLS is configured explicitly",
    );
  const path =
    process.env.SUPABASE_CA_PATH ||
    new URL("../certs/supabase-ca.crt", import.meta.url);
  let ca;
  try {
    ca = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      "Supabase CA certificate is required at backend/certs/supabase-ca.crt",
    );
  }
  if (!ca.includes("-----BEGIN CERTIFICATE-----"))
    throw new Error("Supabase CA file must contain a PEM certificate");
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ca },
  };
}
