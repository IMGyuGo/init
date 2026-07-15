import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";

let auditLayeredMouthAssets;
try {
  ({ auditLayeredMouthAssets } = await import("./audit-layered-mouth-assets.mjs"));
} catch (error) {
  assert.fail(`layered mouth audit module must exist: ${error instanceof Error ? error.message : String(error)}`);
}

const EXPECTED_LAYER_NAMES = [
  "mouth-skin-underlay",
  "mouth-interior",
  "mouth-upper-teeth",
  "mouth-tongue",
  "mouth-upper-lip",
  "mouth-lower-lip",
];
const RGBA_BYTES = 1024 * 1536 * 4;
const EXPECTED_ANCHOR = { x: 512, y: 585 };

function createPngHeader(
  uniqueByte,
  { width = 1024, height = 1536, colorType = 6, ihdrLength = 13, firstChunkType = "IHDR" } = {},
) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(ihdrLength, 8);
  Buffer.from(firstChunkType).copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = colorType;
  bytes[26] = 0;
  bytes[27] = 0;
  bytes[28] = 0;
  bytes[32] = uniqueByte;
  return bytes;
}

function createLayers(overrides = {}) {
  return EXPECTED_LAYER_NAMES.map((name, index) => ({
    name,
    pngPath: `${name}.png`,
    rgbaPath: `${name}.rgba`,
    visible: true,
    anchor: { ...EXPECTED_ANCHOR },
    sourceType: "raster",
    role: name,
    ...overrides[index],
  }));
}

async function writeManifest(directory, layers) {
  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    canvas: { width: 1024, height: 1536 },
    layers,
  }));
  return manifestPath;
}

async function writeCompleteLayerFiles(
  directory,
  layers,
  { pngByteForIndex, pngOptionsForIndex, rgbaForIndex } = {},
) {
  const visibleRgba = Buffer.alloc(RGBA_BYTES);
  visibleRgba[3] = 255;
  await Promise.all(layers.flatMap((layer, index) => [
    writeFile(
      join(directory, layer.pngPath),
      createPngHeader(pngByteForIndex?.(index) ?? index, pngOptionsForIndex?.(index)),
    ),
    writeFile(join(directory, layer.rgbaPath), rgbaForIndex?.(index) ?? visibleRgba),
  ]));
}

async function withFixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "layered-mouth-audit-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("unit: rejects a layer anchor that is not exactly {x:512,y:585}", async () => {
  await withFixture(async (directory) => {
    const manifestPath = await writeManifest(directory, createLayers({
      0: { anchor: { x: 511, y: 585 } },
    }));

    await assert.rejects(
      auditLayeredMouthAssets(manifestPath),
      /mouth-skin-underlay anchor must be exactly \{x:512,y:585\}/,
    );
  });
});

test("unit: rejects a layer anchor with properties beyond x and y", async () => {
  await withFixture(async (directory) => {
    const manifestPath = await writeManifest(directory, createLayers({
      0: { anchor: { x: 512, y: 585, z: 0 } },
    }));

    await assert.rejects(
      auditLayeredMouthAssets(manifestPath),
      /mouth-skin-underlay anchor must be exactly \{x:512,y:585\}/,
    );
  });
});

test("unit: rejects a layer with a missing required field", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers({ 0: { anchor: undefined } });
    delete layers[0].anchor;
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(auditLayeredMouthAssets(manifestPath), /layer mouth-skin-underlay is missing anchor/);
  });
});

test("unit: rejects a PNG whose dimensions do not match the canvas", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeFile(join(directory, layers[0].pngPath), createPngHeader(0, { width: 1023 }));
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(auditLayeredMouthAssets(manifestPath), /mouth-skin-underlay PNG must be 1024x1536/);
  });
});

test("unit: rejects a PNG whose first chunk length is not 13", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeCompleteLayerFiles(directory, layers, {
      pngOptionsForIndex: (index) => (index === 0 ? { ihdrLength: 12 } : undefined),
    });
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(
      auditLayeredMouthAssets(manifestPath),
      /mouth-skin-underlay\.png PNG must have an IHDR chunk length of 13/,
    );
  });
});

test("unit: rejects a PNG whose first chunk type is not IHDR", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeCompleteLayerFiles(directory, layers, {
      pngOptionsForIndex: (index) => (index === 0 ? { firstChunkType: "IEND" } : undefined),
    });
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(
      auditLayeredMouthAssets(manifestPath),
      /mouth-skin-underlay\.png PNG must have IHDR as its first chunk/,
    );
  });
});

test("unit: rejects a PNG whose color type is not RGBA", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeFile(join(directory, layers[0].pngPath), createPngHeader(0, { colorType: 2 }));
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(auditLayeredMouthAssets(manifestPath), /mouth-skin-underlay PNG must use RGBA color type 6/);
  });
});

test("unit: rejects an RGBA buffer with the wrong byte length", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeFile(join(directory, layers[0].pngPath), createPngHeader(0));
    await writeFile(join(directory, layers[0].rgbaPath), Buffer.alloc(1));
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(
      auditLayeredMouthAssets(manifestPath),
      new RegExp(`mouth-skin-underlay RGBA buffer must contain ${RGBA_BYTES} bytes`),
    );
  });
});

test("unit: rejects duplicate PNG content", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeCompleteLayerFiles(directory, layers, {
      pngByteForIndex: (index) => (index === 1 ? 0 : index),
    });
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(auditLayeredMouthAssets(manifestPath), /duplicate layer PNG content detected/);
  });
});

test("unit: rejects fully transparent layers", async () => {
  await withFixture(async (directory) => {
    const transparentRgba = Buffer.alloc(RGBA_BYTES);
    const layers = createLayers();
    await writeCompleteLayerFiles(directory, layers, {
      rgbaForIndex: (index) => (index === 0 ? transparentRgba : undefined),
    });
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(
      auditLayeredMouthAssets(manifestPath),
      /mouth-skin-underlay RGBA must contain non-transparent pixels/,
    );
  });
});

test("audits the V5 layered mouth package", async () => {
  const audit = await auditLayeredMouthAssets(resolve(
    "assets/interviewer-rigging/existing-look-cubism-v5/manifest.json",
  ));

  assert.deepEqual(audit.canvas, { width: 1024, height: 1536 });
  assert.deepEqual(audit.layerNames, EXPECTED_LAYER_NAMES);
  assert.ok(audit.layers.every((layer) => layer.width === 1024 && layer.height === 1536));
  assert.ok(audit.layers.every((layer) => layer.colorType === 6));
  assert.ok(audit.layers.every((layer) => layer.nonTransparent));
  assert.equal(new Set(audit.layers.map((layer) => layer.sha256)).size, audit.layers.length);
});
