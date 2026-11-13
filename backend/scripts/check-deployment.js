import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: { frontend: { type: "string" }, backend: { type: "string" } },
});
if (!values.frontend || !values.backend)
  throw new Error(
    "Pass --frontend https://your-frontend --backend https://your-api",
  );
const front = new URL(values.frontend).origin,
  back = new URL(values.backend).origin;
let failed = false;
async function check(name, run) {
  try {
    await run();
    console.log("PASS: " + name);
  } catch (error) {
    failed = true;
    console.log("FAIL: " + name + " — " + error.message);
  }
}
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
}
for (const [name, url] of [
  ["Backend root", back + "/"],
  ["Backend/database health", back + "/api/health"],
  ["Frontend API forwarding", front + "/api/health"],
])
  await check(name, async () => {
    const response = await request(url);
    if (response.status !== 200) throw new Error("HTTP " + response.status);
    const body = await response.json();
    if (body.status !== "OK" || body.service !== "Studio Management API")
      throw new Error("Expected updated service response");
  });
await check("React Router refresh", async () => {
  const response = await request(front + "/customers");
  if (
    response.status !== 200 ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    throw new Error("Client route did not return the SPA");
});
await check("Production CORS preflight", async () => {
  const response = await request(back + "/api/auth/login", {
    method: "OPTIONS",
    headers: {
      Origin: front,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,authorization",
    },
  });
  if (
    response.status !== 204 ||
    response.headers.get("access-control-allow-origin") !== front
  )
    throw new Error("Expected exact frontend origin in a successful preflight");
});
process.exitCode = failed ? 1 : 0;
