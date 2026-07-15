import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_IHDR_TYPE = Buffer.from("IHDR");
const EXPECTED_CANVAS = { width: 1024, height: 1536 };
const EXPECTED_LAYER_NAMES = [
  "mouth-skin-underlay",
  "mouth-interior",
  "mouth-upper-teeth",
  "mouth-tongue",
  "mouth-upper-lip",
  "mouth-lower-lip",
];
const REQUIRED_LAYER_FIELDS = ["name", "pngPath", "rgbaPath", "visible", "anchor", "sourceType", "role"];
const EXPECTED_ANCHOR = { x: 512, y: 585 };

function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

function readPngHeader(bytes, path) {
  if (bytes.length < 26 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${path} is not a valid PNG file`);
  }
  if (bytes.readUInt32BE(8) !== 13) {
    throw new Error(`${path} PNG must have an IHDR chunk length of 13`);
  }
  if (!bytes.subarray(12, 16).equals(PNG_IHDR_TYPE)) {
    throw new Error(`${path} PNG must have IHDR as its first chunk`);
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}

function resolveAssetPath(manifestDirectory, reference) {
  return resolve(manifestDirectory, reference);
}

function assertExpectedLayerNames(layers) {
  const layerNames = layers.map((layer) => layer?.name);
  if (JSON.stringify(layerNames) !== JSON.stringify(EXPECTED_LAYER_NAMES)) {
    throw new Error(
      `manifest layer names must match ${EXPECTED_LAYER_NAMES.join(", ")}; received ${layerNames.join(", ") || "none"}`,
    );
  }
}

function hasExpectedAnchor(anchor) {
  return Boolean(anchor)
    && !Array.isArray(anchor)
    && Object.keys(anchor).length === 2
    && anchor.x === EXPECTED_ANCHOR.x
    && anchor.y === EXPECTED_ANCHOR.y;
}

export async function auditLayeredMouthAssets(manifestPath) {
  const manifestDirectory = dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (manifest.canvas?.width !== EXPECTED_CANVAS.width || manifest.canvas?.height !== EXPECTED_CANVAS.height) {
    throw new Error(`${manifestPath} canvas must be 1024x1536`);
  }

  if (!Array.isArray(manifest.layers)) {
    throw new Error(`${manifestPath} layers must be an array`);
  }
  assertExpectedLayerNames(manifest.layers);

  const names = new Set();
  const layers = [];
  for (const layer of manifest.layers) {
    for (const field of REQUIRED_LAYER_FIELDS) {
      if (!(field in layer)) throw new Error(`layer ${layer.name} is missing ${field}`);
    }
    if (names.has(layer.name)) throw new Error(`duplicate layer: ${layer.name}`);
    names.add(layer.name);
    if (!hasExpectedAnchor(layer.anchor)) {
      throw new Error(`${layer.name} anchor must be exactly {x:512,y:585}`);
    }

    const png = await readFile(resolveAssetPath(manifestDirectory, layer.pngPath));
    const header = readPngHeader(png, layer.pngPath);
    if (header.width !== EXPECTED_CANVAS.width || header.height !== EXPECTED_CANVAS.height) {
      throw new Error(`${layer.name} PNG must be 1024x1536`);
    }
    if (header.colorType !== 6) throw new Error(`${layer.name} PNG must use RGBA color type 6`);

    const rgba = await readFile(resolveAssetPath(manifestDirectory, layer.rgbaPath));
    const expectedBytes = EXPECTED_CANVAS.width * EXPECTED_CANVAS.height * 4;
    if (rgba.length !== expectedBytes) throw new Error(`${layer.name} RGBA buffer must contain ${expectedBytes} bytes`);
    let nonTransparent = false;
    for (let index = 3; index < rgba.length; index += 4) {
      if (rgba[index] !== 0) {
        nonTransparent = true;
        break;
      }
    }
    if (!nonTransparent) throw new Error(`${layer.name} RGBA must contain non-transparent pixels`);

    layers.push({
      ...layer,
      pngPath: toPosixPath(layer.pngPath),
      rgbaPath: toPosixPath(layer.rgbaPath),
      width: header.width,
      height: header.height,
      colorType: header.colorType,
      nonTransparent,
      sha256: createHash("sha256").update(png).digest("hex"),
    });
  }

  const hashes = new Set(layers.map((layer) => layer.sha256));
  if (hashes.size !== layers.length) throw new Error("duplicate layer PNG content detected");

  return {
    canvas: { ...EXPECTED_CANVAS },
    layerNames: layers.map((layer) => layer.name),
    layers,
  };
}
