import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { initializeCanvas, readPsd } from "../frontend/node_modules/ag-psd/dist/index.js";
import sharp from "../frontend/node_modules/sharp/lib/index.js";
import { assertCanonicalLayerMatches } from "./audit-layered-mouth-visuals.mjs";

initializeCanvas(
  () => { throw new Error("canvas output is not expected during the PSD test"); },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
);

const ASSET_ROOT = resolve("assets/interviewer-rigging/existing-look-cubism-v5");
const MASTER_PATH = resolve("assets/interviewer-rigging/existing-look/normalized/master.png");
const MOUTH_OPEN_PATH = resolve("assets/interviewer-rigging/existing-look/normalized/mouth-open.png");
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
  assert.deepEqual({ width: info.width, height: info.height }, CANVAS, `${path} must stay 1024x1536`);
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
  assert.notEqual(right, -1, "layer must contain visible pixels");
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

function differsInside(left, right) {
  for (let y = MOUTH_REGION.top; y < MOUTH_REGION.bottom; y += 1) {
    for (let x = MOUTH_REGION.left; x < MOUTH_REGION.right; x += 1) {
      const offset = (y * CANVAS.width + x) * 4;
      if (!left.subarray(offset, offset + 4).equals(right.subarray(offset, offset + 4))) return true;
    }
  }
  return false;
}

function assertMatchesMasterOutsideMouth(reference, master, name) {
  for (let y = 0; y < CANVAS.height; y += 1) {
    for (let x = 0; x < CANVAS.width; x += 1) {
      if (x >= MOUTH_REGION.left && x < MOUTH_REGION.right && y >= MOUTH_REGION.top && y < MOUTH_REGION.bottom) continue;
      const offset = (y * CANVAS.width + x) * 4;
      assert.ok(
        reference.subarray(offset, offset + 4).equals(master.subarray(offset, offset + 4)),
        `${name} changes master outside the bounded mouth region at ${x},${y}`,
      );
    }
  }
}

test("production: manifest preserves exact visible role and source contracts", async () => {
  const manifest = JSON.parse(await readFile(resolve(ASSET_ROOT, "manifest.json"), "utf8"));
  assert.deepEqual(
    manifest.layers.map(({ name, role, sourceType, visible }) => [name, role, sourceType, visible]),
    EXPECTED_LAYERS.map(([name, role, sourceType]) => [name, role, sourceType, true]),
  );
});

test("production: transparent alpha pixels map to exact chroma green", async () => {
  const manifest = JSON.parse(await readFile(resolve(ASSET_ROOT, "manifest.json"), "utf8"));
  for (const layer of manifest.layers) {
    const alpha = await rawRgba(resolve(ASSET_ROOT, layer.pngPath));
    const chroma = await rawRgba(resolve(ASSET_ROOT, "layers", `${layer.name}-chroma.png`));
    for (let offset = 0; offset < alpha.length; offset += 4) {
      if (alpha[offset + 3] !== 0) continue;
      assert.deepEqual([...chroma.subarray(offset, offset + 3)], [0, 255, 0], `${layer.name} chroma must be #00ff00 where alpha is zero`);
    }
  }
});

test("production: normalized PNG bytes are exactly their committed RGBA buffers", async () => {
  const manifest = JSON.parse(await readFile(resolve(ASSET_ROOT, "manifest.json"), "utf8"));
  for (const layer of manifest.layers) {
    const pngRgba = await rawRgba(resolve(ASSET_ROOT, layer.pngPath));
    const rgba = await readFile(resolve(ASSET_ROOT, layer.rgbaPath));
    assert.deepEqual(pngRgba, rgba, `${layer.name} normalized PNG and RGBA must match exactly`);
  }
});

test("production: both lip layers preserve the 125px mouth-open reference width", async () => {
  const referenceWidth = alphaBounds(await rawRgba(MOUTH_OPEN_PATH)).right - alphaBounds(await rawRgba(MOUTH_OPEN_PATH)).left;
  assert.equal(referenceWidth, 125, "mouth-open reference width must remain the source contract");
  for (const name of ["mouth-upper-lip", "mouth-lower-lip"]) {
    const bounds = alphaBounds(await rawRgba(resolve(ASSET_ROOT, "normalized", `${name}.png`)));
    assert.equal(bounds.right - bounds.left, referenceWidth, `${name} width must match the mouth-open reference`);
  }
});

test("production: canonical semantic source is committed for every mouth role", async () => {
  for (const [name] of EXPECTED_LAYERS) {
    const source = await rawRgba(resolve(ASSET_ROOT, "sources", `${name}.png`));
    const normalized = await rawRgba(resolve(ASSET_ROOT, "normalized", `${name}.png`));
    assertCanonicalLayerMatches(name, normalized, source);
  }
});

test("unit: canonical role audit rejects teeth composited into the lower lip", async () => {
  const lowerLip = await rawRgba(resolve(ASSET_ROOT, "sources/mouth-lower-lip.png"));
  const upperTeeth = await rawRgba(resolve(ASSET_ROOT, "sources/mouth-upper-teeth.png"));
  const contaminated = Buffer.from(lowerLip);
  for (let offset = 0; offset < upperTeeth.length; offset += 4) {
    if (upperTeeth[offset + 3] === 0) continue;
    upperTeeth.copy(contaminated, offset, offset, offset + 4);
  }
  assert.throws(
    () => assertCanonicalLayerMatches("mouth-lower-lip", contaminated, lowerLip),
    /does not match its canonical semantic source/,
  );
});

test("production: anatomy layers contain only their assigned visual role", async () => {
  const referenceBounds = alphaBounds(await rawRgba(MOUTH_OPEN_PATH));
  const referenceWidth = referenceBounds.right - referenceBounds.left;
  const layers = Object.fromEntries(await Promise.all(
    EXPECTED_LAYERS.slice(1).map(async ([name]) => [name, await rawRgba(resolve(ASSET_ROOT, "normalized", `${name}.png`))]),
  ));
  const stats = Object.fromEntries(Object.entries(layers).map(([name, rgba]) => [name, visiblePixelStats(rgba)]));

  assert.ok(stats["mouth-interior"].darkRatio >= 0.9, "interior must remain a dark cavity without lip, tongue, or teeth artwork");
  assert.ok(stats["mouth-interior"].neutralBrightRatio <= 0.01, "interior must not contain teeth");
  assert.ok(stats["mouth-upper-teeth"].neutralBrightRatio >= 0.75, "upper-teeth must be predominantly natural off-white teeth");
  assert.ok(stats["mouth-upper-teeth"].darkRatio <= 0.02, "upper-teeth must not contain the dark cavity");
  assert.ok(stats["mouth-tongue"].redDominantRatio >= 0.95, "tongue must retain its subdued red color family");
  assert.ok(stats["mouth-tongue"].neutralBrightRatio <= 0.01, "tongue must not contain teeth");
  const tongueBounds = alphaBounds(layers["mouth-tongue"]);
  assert.ok(tongueBounds.right - tongueBounds.left <= Math.floor(referenceWidth * 0.85), "tongue must stay narrower than the lip opening");
  assert.ok(stats["mouth-upper-lip"].neutralBrightRatio <= 0.01, "upper lip must not contain teeth");
  assert.ok(stats["mouth-upper-lip"].darkRatio <= 0.05, "upper lip must not contain the dark cavity");
  assert.ok(stats["mouth-lower-lip"].darkRatio <= 0.02, "lower lip must not contain the dark cavity or tongue shadow");
});

test("production: skin underlay alpha boundary is feathered", async () => {
  const underlay = await rawRgba(resolve(ASSET_ROOT, "normalized/mouth-skin-underlay.png"));
  const master = await rawRgba(MASTER_PATH);
  const bounds = alphaBounds(underlay);
  const stats = visiblePixelStats(underlay);
  assert.ok(stats.maxAlpha >= 192, "underlay needs an opaque-enough center to hide the original mouth");
  assert.ok(stats.uniqueColorCount >= 128, "underlay must retain skin texture instead of a flat sampled color");
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
  assert.ok(boundaryPixels >= 100, "underlay needs a measurable feather ring");
  assert.ok(boundaryDelta / (boundaryPixels * 3) <= 1, "underlay feather ring must preserve the master skin pixels to avoid a visible seam");
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      if (x >= UNDERLAY_INPAINT_REGION.left && x < UNDERLAY_INPAINT_REGION.right
        && y >= UNDERLAY_INPAINT_REGION.top && y < UNDERLAY_INPAINT_REGION.bottom) continue;
      const offset = (y * CANVAS.width + x) * 4;
      assert.deepEqual(
        [...underlay.subarray(offset, offset + 3)],
        [...master.subarray(offset, offset + 3)],
        `underlay must preserve master RGB outside the original mouth at ${x},${y}`,
      );
    }
  }
  for (let x = bounds.left; x < bounds.right; x += 1) {
    assert.notEqual(alphaAt(underlay, x, bounds.top), 255, "underlay top boundary must not be opaque");
    assert.notEqual(alphaAt(underlay, x, bounds.bottom - 1), 255, "underlay bottom boundary must not be opaque");
  }
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    assert.notEqual(alphaAt(underlay, bounds.left, y), 255, "underlay left boundary must not be opaque");
    assert.notEqual(alphaAt(underlay, bounds.right - 1, y), 255, "underlay right boundary must not be opaque");
  }
});

test("production: QA references preserve master pixels outside mouth and differ within it", async () => {
  const master = await rawRgba(MASTER_PATH);
  for (const name of ["mouth-open-0.png", "mouth-open-05.png", "mouth-open-1.png"]) {
    const reference = await rawRgba(resolve(ASSET_ROOT, "references", name));
    assertMatchesMasterOutsideMouth(reference, master, name);
    assert.ok(differsInside(reference, master), `${name} must alter the mouth region`);
  }
});

test("production: committed PSD contains the manifest's six ordered full-canvas layers", async () => {
  const manifest = JSON.parse(await readFile(resolve(ASSET_ROOT, "manifest.json"), "utf8"));
  const psd = readPsd(await readFile(resolve(ASSET_ROOT, "interviewer-mouth-v5.psd")), {
    skipCompositeImageData: true,
    useImageData: true,
  });
  assert.deepEqual({ width: psd.width, height: psd.height }, CANVAS);
  assert.deepEqual(psd.children?.map((layer) => layer.name), manifest.layers.map((layer) => layer.name));
  assert.equal(psd.children?.length, 6);
  for (const [index, layer] of (psd.children ?? []).entries()) {
    assert.deepEqual(
      { left: layer.left, top: layer.top, right: layer.right, bottom: layer.bottom },
      { left: 0, top: 0, right: CANVAS.width, bottom: CANVAS.height },
      `${layer.name} must be full canvas`,
    );
    assert.ok(layer.imageData, `${layer.name} must contain a decoded pixel payload`);
    assert.deepEqual(
      Buffer.from(layer.imageData.data),
      await readFile(resolve(ASSET_ROOT, manifest.layers[index].rgbaPath)),
      `${layer.name} PSD pixels must exactly match normalized RGBA`,
    );
  }
});
