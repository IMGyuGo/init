const { readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

function collectTestFiles(dir) {
  const entries = readdirSync(dir).sort();
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectTestFiles(path));
    } else if (entry.endsWith(".test.js")) {
      files.push(path);
    }
  }

  return files;
}

const testFiles = collectTestFiles(join(__dirname, "..", "dist"));
if (testFiles.length === 0) {
  console.error("No compiled worker test files found in dist.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
