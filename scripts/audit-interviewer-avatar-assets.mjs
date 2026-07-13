import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

function readPngDimensions(bytes, path) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${path} is not a valid PNG file`);
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function collectPngFiles(directory, baseDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectPngFiles(path, baseDirectory));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) continue;

    const bytes = await readFile(path);
    files.push({
      path: toPosixPath(relative(baseDirectory, path)),
      bytes: bytes.byteLength,
      ...readPngDimensions(bytes, path),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function summarize(files) {
  const dimensions = new Map();
  for (const file of files) {
    dimensions.set(`${file.width}x${file.height}`, { width: file.width, height: file.height });
  }

  return {
    count: files.length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    dimensions: [...dimensions.values()],
    files,
  };
}

export async function auditInterviewerAvatarAssets(baseDirectory) {
  const files = await collectPngFiles(baseDirectory, baseDirectory);
  const pose = summarize(files.filter((file) => !file.path.includes("/")));
  const fullMouth = summarize(files.filter((file) => file.path.startsWith("mouth/")));
  const mouthSprite = summarize(files.filter((file) => file.path.startsWith("mouth-sprite/")));
  const filesByHash = new Map();

  for (const file of files) {
    const paths = filesByHash.get(file.sha256) ?? [];
    paths.push(file.path);
    filesByHash.set(file.sha256, paths);
  }

  const currentPackBytes = pose.bytes + fullMouth.bytes;
  const spriteCandidatePackBytes = pose.bytes + mouthSprite.bytes;
  const spriteCandidateSavingsBytes = currentPackBytes - spriteCandidatePackBytes;

  return {
    pose,
    fullMouth,
    mouthSprite,
    currentPackBytes,
    spriteCandidatePackBytes,
    spriteCandidateSavingsBytes,
    spriteCandidateSavingsPercent: Math.round((spriteCandidateSavingsBytes / currentPackBytes) * 10_000) / 100,
    duplicateGroups: [...filesByHash.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([sha256, paths]) => ({ sha256, paths: paths.sort() }))
      .sort((left, right) => left.paths[0].localeCompare(right.paths[0])),
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFilePath) {
  const projectRoot = resolve(dirname(currentFilePath), "..");
  const audit = await auditInterviewerAvatarAssets(
    resolve(projectRoot, "frontend/public/assets/interviewer-avatar"),
  );
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
}
