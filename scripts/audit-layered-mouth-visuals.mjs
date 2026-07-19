import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initializeCanvas, readPsd } from "../frontend/node_modules/ag-psd/dist/index.js";
import sharp from "../frontend/node_modules/sharp/lib/index.js";

initializeCanvas(
  () => { throw new Error("canvas output is not expected during the PSD audit"); },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
);

const CANVAS = { width: 1024, height: 1536 };
const MOUTH_REGION = { left: 400, top: 530, right: 625, bottom: 675 };
const UNDERLAY_INPAINT_REGION = { left: 440, top: 560, right: 586, bottom: 636 };
const EXPECTED_LAYERS = [
  ["mouth-skin-underlay", "underlay", "identity-preserve-edit"],
  ["mouth-interior", "clipping-owner", "hybrid-reconstruction"],
  ["mouth-upper-teeth", "clipped-content", "hybrid-reconstruction"],
  ["mouth-tongue", "clipped-content", "hybrid-reconstruction"],
  ["mouth-upper-lip", "opaque-deforming-lip", "identity-preserve-edit"],
  ["mouth-lower-lip", "opaque-deforming-lip", "identity-preserve-edit"],
];

async function rawRgba(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual({ width: info.width, height: info.height }, CANVAS, `${path} must be 1024x1536`);
  return data;
}

function alphaBounds(rgba) {
  let left = CANVAS.width;
  let top = CANVAS.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < CANVAS.height; y += 1) {
    for (let x = 0; x < CANVAS.width; x += 1) {
      if (rgba[(y * CANVAS.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error("layer must contain visible pixels");
  return { left, top, right: right + 1, bottom: bottom + 1 };
}

function alphaAt(rgba, x, y) {
  return rgba[(y * CANVAS.width + x) * 4 + 3];
}

function visiblePixelStats(rgba) {
  let visible = 0;
  let dark = 0;
  let neutralBright = 0;
  let redDominant = 0;
  let maxAlpha = 0;
  const colors = new Set();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const alpha = rgba[offset + 3];
    if (alpha <= 16) continue;
    const red = rgba[offset];
    const green = rgba[offset + 1];
    const blue = rgba[offset + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    visible += 1;
    if (luminance < 75) dark += 1;
    if (luminance > 160 && saturation < 55) neutralBright += 1;
    if (red > green + 15 && red > blue + 15) redDominant += 1;
    maxAlpha = Math.max(maxAlpha, alpha);
    colors.add((red << 16) | (green << 8) | blue);
  }
  assert.ok(visible > 0, "layer must contain pixels above the semantic alpha threshold");
  return {
    darkRatio: dark / visible,
    neutralBrightRatio: neutralBright / visible,
    redDominantRatio: redDominant / visible,
    maxAlpha,
    uniqueColorCount: colors.size,
  };
}

export function assertCanonicalLayerMatches(name, actual, canonical) {
  assert.equal(actual.length, canonical.length, `${name} canonical source length differs`);
  assert.ok(actual.equals(canonical), `${name} does not match its canonical semantic source`);
}

function differsInside(left, right) {
  for (let y = MOUTH_REGION.top; y < MOUTH_REGION.bottom; y += 1) {
    for (let x = MOUTH_REGION.left; x < MOUTH_REGION.right; x += 1) {
      const offset = (y * CANVAS.width + x) * 4;
      if (!left.subarray(offset, offset + 4).equals(right.subarray(offset, offset + 4))) return true;
    }
  }
  return false;
}

export async function auditLayeredMouthVisuals(root = resolve("assets/interviewer-rigging/existing-look-cubism-v5")) {
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  assert.deepEqual({ canvas: manifest.canvas, anchor: manifest.mouthAnchor }, { canvas: CANVAS, anchor: { x: 512, y: 585 } });
  assert.deepEqual(
    manifest.layers.map(({ name, role, sourceType, visible }) => [name, role, sourceType, visible]),
    EXPECTED_LAYERS.map(([name, role, sourceType]) => [name, role, sourceType, true]),
  );

  for (const layer of manifest.layers) {
    const rgba = await rawRgba(resolve(root, layer.pngPath));
    assert.deepEqual(rgba, await readFile(resolve(root, layer.rgbaPath)), `${layer.name} normalized PNG and RGBA differ`);
    const chroma = await rawRgba(resolve(root, "layers", `${layer.name}-chroma.png`));
    for (let offset = 0; offset < rgba.length; offset += 4) {
      if (rgba[offset + 3] === 0) assert.deepEqual([...chroma.subarray(offset, offset + 3)], [0, 255, 0]);
    }
  }

  const mouthOpen = alphaBounds(await rawRgba(resolve(root, "../existing-look/normalized/mouth-open.png")));
  const referenceWidth = mouthOpen.right - mouthOpen.left;
  for (const name of ["mouth-upper-lip", "mouth-lower-lip"]) {
    const bounds = alphaBounds(await rawRgba(resolve(root, "normalized", `${name}.png`)));
    assert.equal(bounds.right - bounds.left, referenceWidth, `${name} width must match mouth-open`);
  }

  for (const [name] of EXPECTED_LAYERS) {
    const source = await rawRgba(resolve(root, "sources", `${name}.png`));
    const normalized = await rawRgba(resolve(root, "normalized", `${name}.png`));
    assertCanonicalLayerMatches(name, normalized, source);
  }

  const anatomy = Object.fromEntries(await Promise.all(
    EXPECTED_LAYERS.slice(1).map(async ([name]) => [name, await rawRgba(resolve(root, "normalized", `${name}.png`))]),
  ));
  const stats = Object.fromEntries(Object.entries(anatomy).map(([name, rgba]) => [name, visiblePixelStats(rgba)]));
  assert.ok(stats["mouth-interior"].darkRatio >= 0.9, "interior contains non-cavity artwork");
  assert.ok(stats["mouth-interior"].neutralBrightRatio <= 0.01, "interior contains teeth");
  assert.ok(stats["mouth-upper-teeth"].neutralBrightRatio >= 0.75, "upper-teeth are not predominantly off-white");
  assert.ok(stats["mouth-upper-teeth"].darkRatio <= 0.02, "upper-teeth contain the dark cavity");
  assert.ok(stats["mouth-tongue"].redDominantRatio >= 0.95, "tongue leaves its expected color family");
  assert.ok(stats["mouth-tongue"].neutralBrightRatio <= 0.01, "tongue contains teeth");
  const tongueBounds = alphaBounds(anatomy["mouth-tongue"]);
  assert.ok(tongueBounds.right - tongueBounds.left <= Math.floor(referenceWidth * 0.85), "tongue is too wide for the mouth opening");
  assert.ok(stats["mouth-upper-lip"].neutralBrightRatio <= 0.01, "upper lip contains teeth");
  assert.ok(stats["mouth-upper-lip"].darkRatio <= 0.05, "upper lip contains the dark cavity");
  assert.ok(stats["mouth-lower-lip"].darkRatio <= 0.02, "lower lip contains the dark cavity or tongue shadow");

  const underlay = await rawRgba(resolve(root, "normalized/mouth-skin-underlay.png"));
  const underlayBounds = alphaBounds(underlay);
  const underlayStats = visiblePixelStats(underlay);
  assert.ok(underlayStats.maxAlpha >= 192, "underlay center is not opaque enough");
  assert.ok(underlayStats.uniqueColorCount >= 128, "underlay is a flat sampled color");
  for (let x = underlayBounds.left; x < underlayBounds.right; x += 1) {
    assert.notEqual(alphaAt(underlay, x, underlayBounds.top), 255);
    assert.notEqual(alphaAt(underlay, x, underlayBounds.bottom - 1), 255);
  }
  for (let y = underlayBounds.top; y < underlayBounds.bottom; y += 1) {
    assert.notEqual(alphaAt(underlay, underlayBounds.left, y), 255);
    assert.notEqual(alphaAt(underlay, underlayBounds.right - 1, y), 255);
  }

  const master = await rawRgba(resolve(root, "../existing-look/normalized/master.png"));
  let boundaryPixels = 0;
  let boundaryDelta = 0;
  for (let offset = 0; offset < underlay.length; offset += 4) {
    const alpha = underlay[offset + 3];
    if (alpha <= 16 || alpha > 96) continue;
    boundaryPixels += 1;
    boundaryDelta += Math.abs(underlay[offset] - master[offset]);
    boundaryDelta += Math.abs(underlay[offset + 1] - master[offset + 1]);
    boundaryDelta += Math.abs(underlay[offset + 2] - master[offset + 2]);
  }
  assert.ok(boundaryPixels >= 100, "underlay feather ring is too small");
  assert.ok(boundaryDelta / (boundaryPixels * 3) <= 1, "underlay feather ring changes master skin color");
  for (let y = underlayBounds.top; y < underlayBounds.bottom; y += 1) {
    for (let x = underlayBounds.left; x < underlayBounds.right; x += 1) {
      if (x >= UNDERLAY_INPAINT_REGION.left && x < UNDERLAY_INPAINT_REGION.right
        && y >= UNDERLAY_INPAINT_REGION.top && y < UNDERLAY_INPAINT_REGION.bottom) continue;
      const offset = (y * CANVAS.width + x) * 4;
      assert.ok(
        underlay.subarray(offset, offset + 3).equals(master.subarray(offset, offset + 3)),
        `underlay changes master RGB outside the original mouth at ${x},${y}`,
      );
    }
  }

  for (const name of ["mouth-open-0.png", "mouth-open-05.png", "mouth-open-1.png"]) {
    const reference = await rawRgba(resolve(root, "references", name));
    for (let y = 0; y < CANVAS.height; y += 1) {
      for (let x = 0; x < CANVAS.width; x += 1) {
        if (x >= MOUTH_REGION.left && x < MOUTH_REGION.right && y >= MOUTH_REGION.top && y < MOUTH_REGION.bottom) continue;
        const offset = (y * CANVAS.width + x) * 4;
        assert.ok(reference.subarray(offset, offset + 4).equals(master.subarray(offset, offset + 4)), `${name} changed ${x},${y}`);
      }
    }
    assert.ok(differsInside(reference, master), `${name} must alter the mouth region`);
  }

  const psd = readPsd(await readFile(resolve(root, "interviewer-mouth-v5.psd")), {
    skipCompositeImageData: true,
    useImageData: true,
  });
  assert.deepEqual({ width: psd.width, height: psd.height }, CANVAS);
  assert.deepEqual(psd.children?.map((layer) => layer.name), manifest.layers.map((layer) => layer.name));
  assert.equal(psd.children?.length, 6);
  for (const [index, layer] of (psd.children ?? []).entries()) {
    const expected = await readFile(resolve(root, manifest.layers[index].rgbaPath));
    assert.ok(layer.imageData, `${layer.name} PSD layer has no decoded pixel payload`);
    assert.ok(Buffer.from(layer.imageData.data).equals(expected), `${layer.name} PSD pixels differ from normalized RGBA`);
  }
  return {
    canvas: CANVAS,
    layers: manifest.layers.map((layer) => layer.name),
    semanticRolesVerified: true,
    psdPixelsVerified: true,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename.replace(/^file:\/\//, "")) {
  const audit = await auditLayeredMouthVisuals();
  console.log(`PASS layered-mouth visual audit: ${audit.layers.length} layers on ${audit.canvas.width}x${audit.canvas.height}`);
}
