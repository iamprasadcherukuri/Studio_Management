import { transaction } from "../database/pool.js";
import { fail } from "./records.js";
export async function setUserStatus(id, active, actor) {
  if (!Number.isSafeInteger(id) || id <= 0 || typeof active !== "boolean")
    throw fail("Valid user ID and boolean active are required");
  if (id === actor.id) throw fail("You cannot change your own account status");
  return transaction(async (c) => {
    await c.query(
      "SELECT pg_advisory_xact_lock(hashtext(current_schema()||':administrator-status'))",
    );
    const rows = (
      await c.query(
        "SELECT u.id,u.active,u.password_version,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=ANY($1::int[]) ORDER BY u.id FOR UPDATE OF u",
        [[actor.id, id]],
      )
    ).rows;
    const current = rows.find((u) => u.id === actor.id),
      target = rows.find((u) => u.id === id);
    if (
      !current?.active ||
      current.role !== "admin" ||
      current.password_version !== actor.password_version
    )
      throw fail("Session expired; please sign in again", 401);
    if (!target) throw fail("User not found", 404);
    if (target.active === active) return { id, active };
    if (
      !active &&
      target.role === "admin" &&
      Number(
        (
          await c.query(
            "SELECT count(*) FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active AND r.name='admin'",
          )
        ).rows[0].count,
      ) <= 1
    )
      throw fail("At least one active administrator must remain", 409);
    await c.query(
      "UPDATE users SET active=$1,password_version=password_version+1 WHERE id=$2",
      [active, id],
    );
    await c.query(
      "INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,$2,'users',$3,$4)",
      [
        actor.id,
        active ? "activate_user" : "deactivate_user",
        id,
        {
          previous_status: target.active,
          new_status: active,
          target_user_id: id,
        },
      ],
    );
    return { id, active };
  });
}
