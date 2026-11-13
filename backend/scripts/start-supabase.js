// Supports Render-managed environment variables and optional ignored local env files.
process.env.DATABASE_TARGET = "supabase";
await import("../server.js");
