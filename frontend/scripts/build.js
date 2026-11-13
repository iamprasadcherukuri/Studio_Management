// Vercel's normal npm build also emits deployable routing, without a tracked vercel.json.
if (process.env.VERCEL === "1" || process.env.VERCEL === "true")
  await import("./build-vercel.js");
else {
  const { build } = await import("vite");
  await build();
}
