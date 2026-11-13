import "dotenv/config";
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
