import jwt from "jsonwebtoken";
import { pool } from "../database/pool.js";
import { config } from "../config/env.js";
export async function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Please sign in" });
    const claims = jwt.verify(token, config.secret, { algorithms: ["HS256"] });
    const { rows } = await pool.query(
      "SELECT u.id,u.name,u.email,u.must_change_password,u.password_version,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.active=true",
      [claims.sub],
    );
    if (!rows[0]) return res.status(401).json({ error: "Account unavailable" });
    if ((claims.pv ?? 0) !== rows[0].password_version)
      return res
        .status(401)
        .json({ error: "Password changed; please sign in again" });
    req.user = rows[0];
    if (
      req.user.must_change_password &&
      !["/auth/me", "/auth/change-password"].includes(req.path)
    )
      return res
        .status(403)
        .json({
          error: "Change your temporary password before continuing",
          code: "PASSWORD_CHANGE_REQUIRED",
        });
    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    )
      return res.status(401).json({ error: "Session expired; please sign in" });
    next(error);
  }
}
export function admin(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Administrator access required" });
  next();
}
