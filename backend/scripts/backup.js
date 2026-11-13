import { fileURLToPath } from "node:url";
import { verifiedBackup } from "./verified-backup.js";
export const backupDatabase = verifiedBackup;
if (process.argv[1] === fileURLToPath(import.meta.url)) await backupDatabase();
