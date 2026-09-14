import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const dataDir = resolve(process.env.DATA_DIR || "data");
const logFile = join(dataDir, "error.log");

const limit = Number(process.argv[2]) || 100;

console.log(`\n======================================================`);
console.log(` Shotel System & Error Logs: ${logFile}`);
console.log(` Showing last ${limit} lines`);
console.log(`======================================================\n`);

if (!existsSync(logFile)) {
  console.log(`[INFO] No error.log found yet at ${logFile}`);
  console.log(`(Log entries will appear when requests or errors occur.)\n`);
  process.exit(0);
}

const content = readFileSync(logFile, "utf8");
const lines = content.trim().split("\n").filter(Boolean);

if (!lines.length) {
  console.log(`[INFO] error.log is currently empty.\n`);
  process.exit(0);
}

const slice = lines.slice(-limit);
for (const line of slice) {
  if (line.includes("[ERROR]")) {
    console.error(`\x1b[31m${line}\x1b[0m`);
  } else if (line.includes("[INFO]")) {
    console.log(`\x1b[36m${line}\x1b[0m`);
  } else {
    console.log(line);
  }
}

console.log(`\n======================================================`);
console.log(` Total entries shown: ${slice.length} / ${lines.length}`);
console.log(`======================================================\n`);
