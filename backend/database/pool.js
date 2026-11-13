import pg from "pg";
// Preserve calendar dates rather than converting them to UTC timestamps.
pg.types.setTypeParser(1082, (value) => value);
import { config } from "../config/env.js";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c search_path=${config.schema},public`,
  max: 10,
});
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
