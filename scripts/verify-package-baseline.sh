#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

command -v node >/dev/null 2>&1 || {
  echo "[fail] node is required to verify package baseline"
  exit 1
}

node - "$ROOT" <<'NODE'
const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const expected = {
  "frontend": {
    dependencies: {
      next: "16.2.9",
      react: "19.2.7",
      "react-dom": "19.2.7",
    },
    devDependencies: {
      "@types/node": "20.19.43",
      "@types/react": "19.2.17",
      "@types/react-dom": "19.2.3",
      eslint: "9.39.4",
      "eslint-config-next": "16.2.9",
      typescript: "5.9.3",
    },
  },
  "backend/api": {
    dependencies: {
      "@aws-sdk/client-s3": "3.1075.0",
      "@aws-sdk/client-sqs": "3.1075.0",
      "@nestjs/common": "11.1.27",
      "@nestjs/config": "4.0.4",
      "@nestjs/core": "11.1.27",
      "@nestjs/jwt": "11.0.2",
      "@nestjs/platform-express": "11.1.27",
      "@prisma/client": "6.19.3",
      "class-transformer": "0.5.1",
      "class-validator": "0.15.1",
      "reflect-metadata": "0.2.2",
      rxjs: "7.8.2",
    },
    devDependencies: {
      "@types/node": "20.19.43",
      prisma: "6.19.3",
      tsx: "4.22.4",
      typescript: "5.9.3",
    },
  },
  "backend/worker": {
    dependencies: {
      "@aws-sdk/client-s3": "3.1075.0",
      "@aws-sdk/client-sqs": "3.1075.0",
      "@mediapipe/tasks-vision": "0.10.35",
      openai: "6.45.0",
    },
    devDependencies: {
      "@types/node": "20.19.43",
      tsx: "4.22.4",
      typescript: "5.9.3",
    },
  },
  "backend/common": {
    dependencies: {
      "class-transformer": "0.5.1",
      "class-validator": "0.15.1",
    },
    devDependencies: {
      "@types/node": "20.19.43",
      typescript: "5.9.3",
    },
  },
};

let failed = false;
for (const [relative, sections] of Object.entries(expected)) {
  const packagePath = path.join(root, relative, "package.json");
  const lockPath = path.join(root, relative, "package-lock.json");
  if (!fs.existsSync(packagePath)) {
    console.log(`[fail] missing ${relative}/package.json`);
    failed = true;
    continue;
  }
  if (!fs.existsSync(lockPath)) {
    console.log(`[fail] missing ${relative}/package-lock.json`);
    failed = true;
  }
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  for (const [section, deps] of Object.entries(sections)) {
    for (const [name, want] of Object.entries(deps)) {
      const actual = pkg[section]?.[name];
      if (actual !== want) {
        console.log(`[fail] ${relative}/package.json ${section}.${name} expected ${want} but found ${actual}`);
        failed = true;
      }
    }
  }
  console.log(`[ok] package baseline: ${relative}`);
}

const versionNeedles = Array.from(new Set([
  "20.x",
  ">=10",
  "16.2.9",
  "19.2.7",
  "20.19.43",
  "19.2.17",
  "19.2.3",
  "9.39.4",
  "5.9.3",
  "11.1.27",
  "4.0.4",
  "11.0.2",
  "6.19.3",
  "0.5.1",
  "0.15.1",
  "0.2.2",
  "7.8.2",
  "4.22.4",
  "3.1075.0",
  "0.10.35",
  "6.45.0",
]));

const baselineDocs = [
  "docs/04_implementation/team-split-5dev-1pm.md",
  "docs/04_implementation/one-time-alignment/agent-a.md",
  "docs/04_implementation/one-time-alignment/agent-b.md",
  "docs/04_implementation/one-time-alignment/agent-c.md",
  "docs/04_implementation/one-time-alignment/agent-d.md",
  "docs/04_implementation/one-time-alignment/agent-e.md",
  "docs/04_implementation/one-time-alignment/agent-pm.md",
];

for (const relative of baselineDocs) {
  const docPath = path.join(root, relative);
  if (!fs.existsSync(docPath)) {
    console.log(`[fail] missing package baseline doc ${relative}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(docPath, "utf8");
  for (const needle of versionNeedles) {
    if (!text.includes(needle)) {
      console.log(`[fail] ${relative} does not mention package baseline version ${needle}`);
      failed = true;
    }
  }
  console.log(`[ok] package baseline doc: ${relative}`);
}

if (failed) {
  console.log("[fail] verify-package-baseline failed");
  process.exit(1);
}
console.log("[ok] verify-package-baseline passed");
NODE
