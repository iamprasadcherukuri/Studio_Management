import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../../", import.meta.url));
const patterns = [".env", "**/.env", "**/.env.*", "backups"];
const tracked = spawnSync("git", ["ls-files", "--", ...patterns], {
  cwd,
  encoding: "utf8",
});
if (tracked.status !== 0)
  throw new Error(
    "Cannot inspect Git tracking: " + (tracked.error?.code || tracked.status),
  );
const history = spawnSync(
  "git",
  ["log", "--all", "--format=%H", "--name-only", "--", ...patterns],
  { cwd, encoding: "utf8" },
);
if (history.status !== 0) throw new Error("Cannot inspect Git history");
const files = new Set(
  history.stdout
    .split(/\r?\n/)
    .filter((line) => line && !/^[0-9a-f]{40}$/.test(line)),
);
const commits = new Set(
  history.stdout.split(/\r?\n/).filter((line) => /^[0-9a-f]{40}$/.test(line)),
);
console.log(
  JSON.stringify(
    {
      trackedSensitivePaths: tracked.stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean),
      historicalSensitivePaths: [...files],
      commitsToReview: commits.size,
      historyChanged: false,
    },
    null,
    2,
  ),
);
if (tracked.stdout.trim() || files.size) process.exitCode = 1;
