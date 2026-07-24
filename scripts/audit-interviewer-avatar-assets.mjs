import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "../frontend/node_modules/sharp/lib/index.js";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MOUTH_SPRITE_PAIRS = [
  ["open-small", "open"],
  ["wide-small", "wide"],
  ["round-small", "round"],
];

function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

function readPngDimensions(bytes, path) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${path} is not a valid PNG file`);
  }

  const colorType = bytes[25];
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType,
    hasAlpha: colorType === 4 || colorType === 6,
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

async function readUpperLipAnchor(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let right = -1;
  let top = info.height;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const lipPixel = alpha > 80
        && red < 145
        && green < 115
        && blue < 110
        && red > green * 0.9;
      if (!lipPixel) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
    }
  }

  if (right < left || top >= info.height) {
    throw new Error(`${path} has no measurable upper-lip pixels`);
  }

  return { x: Math.trunc((left + right) / 2), y: top };
}

async function auditMouthSpriteRegistration(baseDirectory) {
  const registrationManifest = JSON.parse(await readFile(
    resolve(
      PROJECT_ROOT,
      "frontend/src/features/candidate-application-interview/mouth-sprite-registration.json",
    ),
    "utf8",
  ));
  const pairs = [];

  for (const names of MOUTH_SPRITE_PAIRS) {
    const [smallName, fullName] = names;
    const smallAnchor = await readUpperLipAnchor(
      resolve(baseDirectory, `mouth-sprite/${smallName}.png`),
    );
    const fullAnchor = await readUpperLipAnchor(
      resolve(baseDirectory, `mouth-sprite/${fullName}.png`),
    );
    const smallRegistration = registrationManifest.variants[smallName];
    const fullRegistration = registrationManifest.variants[fullName];
    pairs.push({
      names,
      rawDeltaX: smallAnchor.x - fullAnchor.x,
      rawDeltaY: smallAnchor.y - fullAnchor.y,
      registeredDeltaX:
        smallAnchor.x + smallRegistration.x - fullAnchor.x - fullRegistration.x,
      registeredDeltaY:
        smallAnchor.y + smallRegistration.y - fullAnchor.y - fullRegistration.y,
    });
  }

  return {
    canvas: registrationManifest.canvas,
    pairs,
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
  const mouthSpriteRegistration = await auditMouthSpriteRegistration(baseDirectory);

  return {
    pose,
    fullMouth,
    mouthSprite,
    currentPackBytes,
    spriteCandidatePackBytes,
    spriteCandidateSavingsBytes,
    spriteCandidateSavingsPercent: Math.round((spriteCandidateSavingsBytes / currentPackBytes) * 10_000) / 100,
    mouthSpriteRegistration,
    duplicateGroups: [...filesByHash.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([sha256, paths]) => ({ sha256, paths: paths.sort() }))
      .sort((left, right) => left.paths[0].localeCompare(right.paths[0])),
  };
}

function resolveModelReference(modelDirectory, reference) {
  const path = resolve(modelDirectory, reference);
  const relativePath = relative(modelDirectory, path);
  if (relativePath.startsWith("..") || resolve(path) === resolve(modelDirectory)) {
    throw new Error(`Cubism model reference leaves its directory: ${reference}`);
  }
  return { path, relativePath: toPosixPath(relativePath) };
}

export async function auditCubismProofModel(modelJsonPath) {
  const modelDirectory = dirname(modelJsonPath);
  const manifest = JSON.parse(await readFile(modelJsonPath, "utf8"));
  if (manifest.Version !== 3 || !manifest.FileReferences?.Moc || !manifest.FileReferences.Textures?.length) {
    throw new Error(`${modelJsonPath} is not a complete Cubism model3 manifest`);
  }

  const mocReference = resolveModelReference(modelDirectory, manifest.FileReferences.Moc);
  const moc = await readFile(mocReference.path);
  const baseReferenceName = manifest.FileReferences.Moc.replace(/\.moc3$/i, "-base.png");
  if (baseReferenceName === manifest.FileReferences.Moc) {
    throw new Error(`${modelJsonPath} has an invalid Cubism MOC3 reference`);
  }
  const baseReference = resolveModelReference(modelDirectory, baseReferenceName);
  const base = await readFile(baseReference.path);
  const textures = [];
  for (const reference of manifest.FileReferences.Textures) {
    const textureReference = resolveModelReference(modelDirectory, reference);
    const bytes = await readFile(textureReference.path);
    textures.push({
      path: textureReference.relativePath,
      bytes: bytes.byteLength,
      ...readPngDimensions(bytes, textureReference.path),
    });
  }

  const displayInfoReference = resolveModelReference(modelDirectory, manifest.FileReferences.DisplayInfo);
  const displayInfo = JSON.parse(await readFile(displayInfoReference.path, "utf8"));

  return {
    version: manifest.Version,
    moc: {
      path: mocReference.relativePath,
      bytes: moc.byteLength,
    },
    base: {
      path: baseReference.relativePath,
      bytes: base.byteLength,
      ...readPngDimensions(base, baseReference.path),
    },
    textures,
    displayInfo: {
      path: displayInfoReference.relativePath,
      parameterCount: displayInfo.Parameters?.length ?? 0,
      hasMouthOpenParameter: Boolean(
        displayInfo.Parameters?.some((parameter) => parameter.Id === "ParamMouthOpenY"),
      ),
    },
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFilePath) {
  const audit = await auditInterviewerAvatarAssets(
    resolve(PROJECT_ROOT, "frontend/public/assets/interviewer-avatar"),
  );
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
}
