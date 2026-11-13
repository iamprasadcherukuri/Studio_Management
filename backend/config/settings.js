export function readSettings(env) {
  const port = Number(env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be a valid TCP port");
  const rawOrigins =
    env.CORS_ORIGINS ||
    env.FRONTEND_URL ||
    env.FRONTEND_ORIGIN ||
    (env.NODE_ENV === "production" ? "" : "http://localhost:5173");
  if (!rawOrigins)
    throw new Error("FRONTEND_URL or CORS_ORIGINS is required in production");
  const origins = [
    ...new Set(
      rawOrigins.split(",").map((value) => {
        const text = value.trim();
        let url;
        try {
          url = new URL(text);
        } catch {
          throw new Error("Frontend origins must be complete HTTP(S) URLs");
        }
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.hostname.includes("*") ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        )
          throw new Error(
            "Frontend origins cannot contain paths, credentials, queries or wildcards",
          );
        if (env.NODE_ENV === "production" && url.protocol !== "https:")
          throw new Error("Production frontend origins must use HTTPS");
        return url.origin;
      }),
    ),
  ];
  const proxyHops = Number(
    env.TRUST_PROXY_HOPS ?? (env.RENDER === "true" ? 1 : 0),
  );
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5)
    throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 5");
  const schema = env.DB_SCHEMA || "studio";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid DB_SCHEMA");
  return {
    port,
    origins,
    origin: origins[0],
    proxyHops,
    schema,
    secret: env.JWT_SECRET,
  };
}
