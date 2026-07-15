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

function createPngHeader(uniqueByte) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  Buffer.from("IHDR").copy(bytes, 12);
  bytes.writeUInt32BE(1024, 16);
  bytes.writeUInt32BE(1536, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes[26] = 0;
  bytes[27] = 0;
  bytes[28] = 0;
  bytes[32] = uniqueByte;
  return bytes;
}

test("rejects fully transparent layers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "layered-mouth-audit-"));
  try {
    const transparentRgba = Buffer.alloc(RGBA_BYTES);
    const visibleRgba = Buffer.alloc(RGBA_BYTES);
    visibleRgba[3] = 255;
    const layers = EXPECTED_LAYER_NAMES.map((name) => ({
      name,
      pngPath: `${name}.png`,
      rgbaPath: `${name}.rgba`,
      visible: true,
      anchor: { x: 512, y: 585 },
      sourceType: "raster",
      role: name,
    }));

    await Promise.all(layers.flatMap((layer, index) => [
      writeFile(join(directory, layer.pngPath), createPngHeader(index)),
      writeFile(join(directory, layer.rgbaPath), index === 0 ? transparentRgba : visibleRgba),
    ]));
    const manifestPath = join(directory, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({
      canvas: { width: 1024, height: 1536 },
      layers,
    }));

    await assert.rejects(
      auditLayeredMouthAssets(manifestPath),
      /mouth-skin-underlay RGBA must contain non-transparent pixels/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
