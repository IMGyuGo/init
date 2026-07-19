import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeCanvas, readPsd } from "../frontend/node_modules/ag-psd/dist/index.js";
import sharp from "../frontend/node_modules/sharp/lib/index.js";

initializeCanvas(
  () => { throw new Error("canvas output is not expected during the coherent-mouth audit"); },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
);

const EXPECTED_CANVAS = { width: 1024, height: 1536 };
const EXPECTED_ANCHOR = { x: 512, y: 585 };
const EXPECTED_EDIT_REGION = { left: 400, top: 530, right: 625, bottom: 675 };
const EXPECTED_LAYER_NAMES = [
  "mouth-skin-underlay",
  "mouth-interior",
  "mouth-upper-teeth",
  "mouth-tongue",
  "mouth-upper-lip",
  "mouth-lower-lip",
];
const EXPECTED_V5_KEYS = ["cmo3", "moc3", "model3", "texture"];
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PIXEL_COUNT = EXPECTED_CANVAS.width * EXPECTED_CANVAS.height;
const REFERENCE_CLOSED_MOUTH_WIDTH = 101;

function assertExactObject(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must be exactly ${JSON.stringify(expected)}`);
  }
}

function resolveInside(baseDirectory, reference, label) {
  if (typeof reference !== "string" || reference.length === 0) {
    throw new Error(`${label} must be a non-empty path`);
  }
  const path = resolve(baseDirectory, reference);
  const relativePath = relative(baseDirectory, path);
  if (relativePath === "" || relativePath.startsWith("..") || resolve(path) === resolve(baseDirectory)) {
    throw new Error(`${label} leaves its allowed directory`);
  }
  return path;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function validateManifest(manifest) {
  assertExactObject(manifest.canvas, EXPECTED_CANVAS, "canvas");
  assertExactObject(manifest.mouthAnchor, EXPECTED_ANCHOR, "mouthAnchor");
  assertExactObject(manifest.editRegion, EXPECTED_EDIT_REGION, "editRegion");
  if (manifest.sourceCompositePath !== "sources/mouth-open-coherent.png") {
    throw new Error("sourceCompositePath must be sources/mouth-open-coherent.png");
  }
  if (!Array.isArray(manifest.layers)) throw new Error("layers must be an array");
  const layerNames = manifest.layers.map((layer) => layer?.name);
  if (JSON.stringify(layerNames) !== JSON.stringify(EXPECTED_LAYER_NAMES)) {
    throw new Error(`layer names must match ${EXPECTED_LAYER_NAMES.join(", ")}`);
  }
  for (const layer of manifest.layers) {
    assertExactObject(layer.anchor, EXPECTED_ANCHOR, `${layer.name} anchor`);
    for (const field of ["pngPath", "rgbaPath", "visible", "sourceType", "role"]) {
      if (!(field in layer)) throw new Error(`${layer.name} is missing ${field}`);
    }
    if (layer.name !== "mouth-skin-underlay" && !layer.maskPath) {
      throw new Error(`${layer.name} must declare maskPath`);
    }
  }
  const preservationKeys = Object.keys(manifest.v5Preservation?.sha256 ?? {}).sort();
  if (JSON.stringify(preservationKeys) !== JSON.stringify(EXPECTED_V5_KEYS)) {
    throw new Error(`v5Preservation.sha256 must contain ${EXPECTED_V5_KEYS.join(", ")}`);
  }
  const pathKeys = Object.keys(manifest.v5Preservation?.paths ?? {}).sort();
  if (JSON.stringify(pathKeys) !== JSON.stringify(EXPECTED_V5_KEYS)) {
    throw new Error(`v5Preservation.paths must contain ${EXPECTED_V5_KEYS.join(", ")}`);
  }
  return layerNames;
}

async function verifyV5Preservation(manifest, projectRoot) {
  for (const key of EXPECTED_V5_KEYS) {
    const path = resolveInside(projectRoot, manifest.v5Preservation.paths[key], `V5 ${key} path`);
    const actual = await sha256(path);
    if (actual !== manifest.v5Preservation.sha256[key]) {
      throw new Error(`V5 preservation hash mismatch for ${key}`);
    }
  }
}

async function verifyDeclaredPackagePaths(manifest, manifestDirectory) {
  await readFile(resolveInside(manifestDirectory, manifest.sourceCompositePath, "sourceCompositePath"));
  for (const layer of manifest.layers) {
    await readFile(resolveInside(manifestDirectory, layer.pngPath, `${layer.name} pngPath`));
    await readFile(resolveInside(manifestDirectory, layer.rgbaPath, `${layer.name} rgbaPath`));
    if (layer.maskPath) {
      await readFile(resolveInside(manifestDirectory, layer.maskPath, `${layer.name} maskPath`));
    }
  }
}

async function readRgba(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== EXPECTED_CANVAS.width || info.height !== EXPECTED_CANVAS.height || info.channels !== 4) {
    throw new Error(`${path} must decode to 1024x1536 RGBA`);
  }
  return data;
}

async function readMask(path) {
  const { data, info } = await sharp(path).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== EXPECTED_CANVAS.width || info.height !== EXPECTED_CANVAS.height || info.channels !== 1) {
    throw new Error(`${path} must decode to a 1024x1536 grayscale mask`);
  }
  return data;
}

function booleanBounds(mask, label) {
  let left = EXPECTED_CANVAS.width;
  let top = EXPECTED_CANVAS.height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0) continue;
    const x = index % EXPECTED_CANVAS.width;
    const y = Math.floor(index / EXPECTED_CANVAS.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (right < 0) throw new Error(`${label} has no visible pixels`);
  return { left, top, right: right + 1, bottom: bottom + 1 };
}

function maxChannelDelta(left, right) {
  if (left.length !== right.length) throw new Error("RGBA payload lengths differ");
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
  }
  return maximum;
}

function verifyOutsideEditRegionUnchanged(source, master) {
  for (let y = 0; y < EXPECTED_CANVAS.height; y += 1) {
    for (let x = 0; x < EXPECTED_CANVAS.width; x += 1) {
      if (
        x >= EXPECTED_EDIT_REGION.left
        && x < EXPECTED_EDIT_REGION.right
        && y >= EXPECTED_EDIT_REGION.top
        && y < EXPECTED_EDIT_REGION.bottom
      ) continue;
      const offset = (y * EXPECTED_CANVAS.width + x) * 4;
      if (!source.subarray(offset, offset + 4).equals(master.subarray(offset, offset + 4))) {
        throw new Error(`coherent source changes identity pixels outside the mouth at ${x},${y}`);
      }
    }
  }
}

async function verifyPsd(manifest, manifestDirectory) {
  const psdPath = resolveInside(manifestDirectory, "interviewer-mouth-v6.psd", "V6 PSD path");
  const psd = readPsd(await readFile(psdPath), {
    skipCompositeImageData: true,
    useImageData: true,
  });
  if (psd.width !== EXPECTED_CANVAS.width || psd.height !== EXPECTED_CANVAS.height) {
    throw new Error("V6 PSD canvas differs from the manifest canvas");
  }
  const psdLayerNames = (psd.children ?? []).map((layer) => layer.name);
  if (JSON.stringify(psdLayerNames) !== JSON.stringify(EXPECTED_LAYER_NAMES)) {
    throw new Error("V6 PSD layer order differs from the manifest");
  }
  for (const [index, layer] of (psd.children ?? []).entries()) {
    if (!layer.imageData) throw new Error(`${layer.name} PSD layer has no decoded pixels`);
    const expected = await readFile(
      resolveInside(manifestDirectory, manifest.layers[index].rgbaPath, `${layer.name} rgbaPath`),
    );
    if (!Buffer.from(layer.imageData.data).equals(expected)) {
      throw new Error(`${layer.name} PSD pixels differ from normalized RGBA`);
    }
  }
  return psdLayerNames;
}

function validateMeasuredMetrics(metrics, manifestMetrics) {
  if (Math.abs(metrics.centerX - EXPECTED_ANCHOR.x) > 2) throw new Error("mouth center X exceeds 2px");
  if (metrics.widthRatio < 0.95 || metrics.widthRatio > 1.05) throw new Error("mouth width ratio is outside 0.95..1.05");
  if (metrics.cornerYDelta > 3) throw new Error("mouth corner Y delta exceeds 3px");
  if (metrics.upperLipTeethGap > 1) throw new Error("upper lip and teeth are detached");
  if (metrics.uncoveredOpeningPixels !== 0) throw new Error("mouth opening contains uncovered pixels");
  if (metrics.tongueOutsideInteriorPixels !== 0) throw new Error("tongue leaves the mouth opening");
  if (metrics.overlappingSemanticPixels !== 0) throw new Error("semantic mouth masks overlap");
  if (metrics.upperTeethHeightRatio < 0.20 || metrics.upperTeethHeightRatio > 0.25) {
    throw new Error("upper-teeth height ratio is outside 0.20..0.25");
  }
  if (metrics.lowerTeethLikePixels !== 0) throw new Error("lower-teeth-like pixels remain");
  if (metrics.recompositionMaxChannelDelta > 1) throw new Error("recomposition differs from the coherent source");

  const manifestChecks = {
    centerX: metrics.centerX,
    width: metrics.width,
    widthRatio: Number(metrics.widthRatio.toFixed(6)),
    cornerYDelta: metrics.cornerYDelta,
    upperLipTeethGap: metrics.upperLipTeethGap,
    uncoveredOpeningPixels: metrics.uncoveredOpeningPixels,
    tongueOutsideInteriorPixels: metrics.tongueOutsideInteriorPixels,
    overlappingSemanticPixels: metrics.overlappingSemanticPixels,
    upperTeethHeightRatio: Number(metrics.upperTeethHeightRatio.toFixed(6)),
    lowerTeethLikePixels: metrics.lowerTeethLikePixels,
    recompositionMaxChannelDelta: metrics.recompositionMaxChannelDelta,
  };
  for (const [key, value] of Object.entries(manifestChecks)) {
    if (key === "cornerYDelta" && Math.abs((manifestMetrics?.[key] ?? Infinity) - value) <= 1) {
      continue;
    }
    if (manifestMetrics?.[key] !== value) {
      throw new Error(`manifest coherentMouthMetrics.${key} differs from decoded assets`);
    }
  }
}

async function measurePackage(manifest, manifestDirectory, projectRoot) {
  const sourcePath = resolveInside(manifestDirectory, manifest.sourceCompositePath, "sourceCompositePath");
  const source = await readRgba(sourcePath);
  const recomposed = await readRgba(
    resolveInside(manifestDirectory, "references/mouth-open-recomposed.png", "recomposition reference"),
  );
  const master = await readRgba(
    resolve(projectRoot, "assets/interviewer-rigging/existing-look/normalized/master.png"),
  );
  verifyOutsideEditRegionUnchanged(source, master);

  const masks = {};
  for (const layer of manifest.layers) {
    const pngPath = resolveInside(manifestDirectory, layer.pngPath, `${layer.name} pngPath`);
    const rgba = await readRgba(pngPath);
    const rgbaBytes = await readFile(
      resolveInside(manifestDirectory, layer.rgbaPath, `${layer.name} rgbaPath`),
    );
    if (!rgba.equals(rgbaBytes)) throw new Error(`${layer.name} PNG and RGBA payloads differ`);
    if (!layer.maskPath) continue;
    const mask = await readMask(
      resolveInside(manifestDirectory, layer.maskPath, `${layer.name} maskPath`),
    );
    const visible = new Uint8Array(PIXEL_COUNT);
    for (let index = 0; index < PIXEL_COUNT; index += 1) {
      if (rgba[index * 4 + 3] !== mask[index]) {
        throw new Error(`${layer.name} alpha differs from its semantic mask`);
      }
      visible[index] = mask[index] >= 128 ? 1 : 0;
    }
    masks[layer.name] = visible;
  }

  const openingRaw = await readMask(
    resolveInside(manifestDirectory, "masks/mouth-opening-mask.png", "mouth opening mask"),
  );
  const opening = Uint8Array.from(openingRaw, (alpha) => (alpha >= 128 ? 1 : 0));
  const anatomy = new Uint8Array(PIXEL_COUNT);
  let overlappingSemanticPixels = 0;
  let uncoveredOpeningPixels = 0;
  let tongueOutsideInteriorPixels = 0;
  for (let index = 0; index < PIXEL_COUNT; index += 1) {
    const count = EXPECTED_LAYER_NAMES.slice(1).reduce(
      (sum, name) => sum + masks[name][index],
      0,
    );
    anatomy[index] = count > 0 ? 1 : 0;
    if (count > 1) overlappingSemanticPixels += 1;
    const openingCovered = masks["mouth-interior"][index]
      || masks["mouth-upper-teeth"][index]
      || masks["mouth-tongue"][index];
    if (opening[index] && !openingCovered) uncoveredOpeningPixels += 1;
    if (masks["mouth-tongue"][index] && !opening[index]) tongueOutsideInteriorPixels += 1;
  }

  const anatomyBounds = booleanBounds(anatomy, "mouth anatomy");
  const openingBounds = booleanBounds(opening, "mouth opening");
  const teethBounds = booleanBounds(masks["mouth-upper-teeth"], "upper teeth");
  const centerX = (anatomyBounds.left + anatomyBounds.right) / 2;
  const width = anatomyBounds.right - anatomyBounds.left;
  const rowsAt = (mask, x) => {
    const rows = [];
    for (let y = 0; y < EXPECTED_CANVAS.height; y += 1) {
      if (mask[y * EXPECTED_CANVAS.width + x]) rows.push(y);
    }
    return rows;
  };
  const leftRows = rowsAt(anatomy, anatomyBounds.left);
  const rightRows = rowsAt(anatomy, anatomyBounds.right - 1);
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const cornerYDelta = Math.abs(Math.round(mean(leftRows)) - Math.round(mean(rightRows)));

  let upperLipTeethGap = EXPECTED_CANVAS.height;
  for (let x = anatomyBounds.left; x < anatomyBounds.right; x += 1) {
    const upperRows = rowsAt(masks["mouth-upper-lip"], x);
    const teethRows = rowsAt(masks["mouth-upper-teeth"], x);
    if (upperRows.length && teethRows.length) {
      upperLipTeethGap = Math.min(
        upperLipTeethGap,
        Math.max(0, Math.min(...teethRows) - Math.max(...upperRows) - 1),
      );
    }
  }

  let lowerTeethLikePixels = 0;
  for (let index = 0; index < PIXEL_COUNT; index += 1) {
    if (!opening[index]) continue;
    const y = Math.floor(index / EXPECTED_CANVAS.width);
    if (y < 594) continue;
    const offset = index * 4;
    const red = source[offset];
    const green = source[offset + 1];
    const blue = source[offset + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (luminance >= 145 && saturation <= 70) lowerTeethLikePixels += 1;
  }

  const metrics = {
    centerX,
    width,
    widthRatio: width / REFERENCE_CLOSED_MOUTH_WIDTH,
    cornerYDelta,
    upperLipTeethGap,
    uncoveredOpeningPixels,
    tongueOutsideInteriorPixels,
    overlappingSemanticPixels,
    upperTeethHeightRatio:
      (teethBounds.bottom - teethBounds.top) / (openingBounds.bottom - openingBounds.top),
    lowerTeethLikePixels,
    recompositionMaxChannelDelta: maxChannelDelta(source, recomposed),
  };
  validateMeasuredMetrics(metrics, manifest.coherentMouthMetrics);
  const psdLayerNames = await verifyPsd(manifest, manifestDirectory);
  return { ...metrics, psdLayerNames, psdPixelsVerified: true };
}

export async function auditCoherentMouthSource({
  manifestPath = resolve(
    PROJECT_ROOT,
    "assets/interviewer-rigging/existing-look-cubism-v6/manifest.json",
  ),
  projectRoot = PROJECT_ROOT,
  verifyPackageAssets = true,
} = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const layerNames = validateManifest(manifest);
  await verifyV5Preservation(manifest, projectRoot);
  let packageDiagnostics = {};
  if (verifyPackageAssets) {
    await verifyDeclaredPackagePaths(manifest, dirname(manifestPath));
    packageDiagnostics = await measurePackage(manifest, dirname(manifestPath), projectRoot);
  }
  return {
    canvas: EXPECTED_CANVAS,
    mouthAnchor: EXPECTED_ANCHOR,
    editRegion: EXPECTED_EDIT_REGION,
    layerNames,
    v5Preserved: true,
    ...packageDiagnostics,
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === resolve(currentFilePath)) {
  const result = await auditCoherentMouthSource();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
