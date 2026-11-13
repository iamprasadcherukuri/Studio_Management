export function resolveApiBase(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw || raw === "/api") return "/api";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("VITE_API_URL must be a complete backend URL or /api");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.hostname.includes("*") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "VITE_API_URL must be an HTTP(S) backend URL without credentials, queries or fragments",
    );
  if (!["", "/", "/api"].includes(url.pathname))
    throw new Error(
      "VITE_API_URL must point to the backend origin or /api (not /api/api)",
    );
  return url.origin + "/api";
}
