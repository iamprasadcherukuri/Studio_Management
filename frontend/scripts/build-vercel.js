import { build, loadEnv } from "vite";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveApiBase } from "../src/services/api-base.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const env = { ...loadEnv("production", root, ""), ...process.env };
if (!env.VITE_API_URL)
  throw new Error("Set VITE_API_URL in Vercel before building");
const api = resolveApiBase(env.VITE_API_URL);
if (!api.startsWith("https://"))
  throw new Error("Vercel VITE_API_URL must use an HTTPS backend URL");
await build({ root, mode: "production" });
const output = new URL("../.vercel/output/", import.meta.url);
await mkdir(new URL("static/", output), { recursive: true });
await cp(new URL("../dist/", import.meta.url), new URL("static/", output), {
  recursive: true,
});
await writeFile(
  new URL("config.json", output),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/(.*)",
          headers: {
            "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${new URL(api).origin}; frame-src 'self' blob:; object-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          },
          continue: true,
        },
        { src: "^/api(?:/(.*))?$", dest: api + "/$1" },
        { handle: "filesystem" },
        { src: "/assets/.*", status: 404 },
        { src: "/.*", dest: "/index.html" },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Prepared Vercel Build Output API: static assets, Render API proxy and SPA routing.",
);
