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
  return writeManifestWith(directory, {
    canvas: { width: 1024, height: 1536 },
    layers,
  });
}

async function writeManifestWith(directory, manifest) {
  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
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

test("unit: rejects canvas width and height mismatches", async () => {
  const cases = [
    { canvas: { width: 1023, height: 1536 }, label: "width" },
    { canvas: { width: 1024, height: 1535 }, label: "height" },
  ];

  for (const { canvas, label } of cases) {
    await withFixture(async (directory) => {
      const manifestPath = await writeManifestWith(directory, { canvas, layers: [] });

      await assert.rejects(auditLayeredMouthAssets(manifestPath), /canvas must be 1024x1536/, label);
    });
  }
});

test("unit: rejects a non-array layers value", async () => {
  await withFixture(async (directory) => {
    const manifestPath = await writeManifestWith(directory, {
      canvas: { width: 1024, height: 1536 },
      layers: { name: "mouth-skin-underlay" },
    });

    await assert.rejects(auditLayeredMouthAssets(manifestPath), /layers must be an array/);
  });
});

test("unit: rejects exact layer-name contract violations after required fields", async () => {
  const cases = [
    { layers: createLayers().slice(0, 5), label: "insufficient layer count" },
    { layers: createLayers({ 2: { name: "mouth-gums" } }), label: "wrong name" },
    {
      layers: createLayers({
        0: { name: EXPECTED_LAYER_NAMES[1] },
        1: { name: EXPECTED_LAYER_NAMES[0] },
      }),
      label: "wrong order",
    },
  ];

  for (const { layers, label } of cases) {
    await withFixture(async (directory) => {
      const manifestPath = await writeManifest(directory, layers);

      await assert.rejects(auditLayeredMouthAssets(manifestPath), /manifest layer names must match/, label);
    });
  }
});

test("unit: rejects an invalid PNG signature", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeFile(join(directory, layers[0].pngPath), Buffer.alloc(33));
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(auditLayeredMouthAssets(manifestPath), /mouth-skin-underlay\.png is not a valid PNG file/);
  });
});

test("unit: rejects a PNG whose height does not match the canvas", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeFile(join(directory, layers[0].pngPath), createPngHeader(0, { height: 1535 }));
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(auditLayeredMouthAssets(manifestPath), /mouth-skin-underlay PNG must be 1024x1536/);
  });
});

test("unit: rejects every missing required layer field before name validation", async () => {
  for (const field of ["name", "pngPath", "rgbaPath", "visible", "anchor", "sourceType", "role"]) {
    await withFixture(async (directory) => {
      const layers = createLayers();
      delete layers[0][field];
      const manifestPath = await writeManifest(directory, layers);

      await assert.rejects(
        auditLayeredMouthAssets(manifestPath),
        new RegExp(`layer ${field === "name" ? "undefined" : "mouth-skin-underlay"} is missing ${field}`),
        field,
      );
    });
  }
});

test("unit: returns the complete audit contract for a valid temporary fixture", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeCompleteLayerFiles(directory, layers);
    const manifestPath = await writeManifest(directory, layers);

    const audit = await auditLayeredMouthAssets(manifestPath);

    assert.deepEqual(audit.canvas, { width: 1024, height: 1536 });
    assert.deepEqual(audit.layerNames, EXPECTED_LAYER_NAMES);
    assert.equal(audit.layers.length, 6);
    assert.ok(audit.layers.every((layer) => layer.width === 1024 && layer.height === 1536));
    assert.ok(audit.layers.every((layer) => layer.colorType === 6 && layer.nonTransparent));
    assert.equal(new Set(audit.layers.map((layer) => layer.sha256)).size, 6);
    assert.deepEqual(
      audit.layers.map(({ name, pngPath, rgbaPath, visible, anchor, sourceType, role }) => ({
        name,
        pngPath,
        rgbaPath,
        visible,
        anchor,
        sourceType,
        role,
      })),
      layers,
    );
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

test("unit: rejects a truncated PNG IHDR", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers();
    await writeCompleteLayerFiles(directory, layers);
    await writeFile(join(directory, layers[0].pngPath), createPngHeader(0).subarray(0, 32));
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(auditLayeredMouthAssets(manifestPath), /mouth-skin-underlay\.png is not a valid PNG file/);
  });
});

test("unit: rejects duplicate layer names before exact order validation", async () => {
  await withFixture(async (directory) => {
    const layers = createLayers({ 1: { name: EXPECTED_LAYER_NAMES[0] } });
    const manifestPath = await writeManifest(directory, layers);

    await assert.rejects(auditLayeredMouthAssets(manifestPath), /duplicate layer: mouth-skin-underlay/);
  });
});

test("unit: rejects non-object manifest layers", async () => {
  for (const invalidLayer of [null, [], "layer"]) {
    await withFixture(async (directory) => {
      const layers = createLayers();
      layers[0] = invalidLayer;
      const manifestPath = await writeManifest(directory, layers);

      await assert.rejects(auditLayeredMouthAssets(manifestPath), /each manifest layer must be an object/);
    });
  }
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
