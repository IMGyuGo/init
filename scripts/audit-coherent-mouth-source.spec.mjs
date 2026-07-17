import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

let auditCoherentMouthSource;
try {
  ({ auditCoherentMouthSource } = await import("./audit-coherent-mouth-source.mjs"));
} catch (error) {
  assert.fail(`coherent mouth audit module must exist: ${error instanceof Error ? error.message : String(error)}`);
}

const V5_KEYS = ["cmo3", "moc3", "model3", "texture"];
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_LAYER_NAMES = [
  "mouth-skin-underlay",
  "mouth-interior",
  "mouth-upper-teeth",
  "mouth-tongue",
  "mouth-upper-lip",
  "mouth-lower-lip",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createManifest(hashes) {
  return {
    id: "existing-look-cubism-v6",
    status: "coherent-mouth-source-preparation",
    derivedFrom: "../existing-look-cubism-v5/interviewer-import-v5.cmo3",
    canvas: { width: 1024, height: 1536 },
    mouthAnchor: { x: 512, y: 585 },
    editRegion: { left: 400, top: 530, right: 625, bottom: 675 },
    sourceCompositePath: "sources/mouth-open-coherent.png",
    v5Preservation: {
      paths: Object.fromEntries(V5_KEYS.map((key) => [key, `v5/${key}.bin`])),
      sha256: hashes,
    },
    layers: EXPECTED_LAYER_NAMES.map((name) => ({
      name,
      pngPath: `normalized/${name}.png`,
      rgbaPath: `normalized/${name}.rgba`,
      maskPath: name === "mouth-skin-underlay" ? null : `masks/${name}-mask.png`,
      visible: true,
      anchor: { x: 512, y: 585 },
      sourceType: name === "mouth-skin-underlay"
        ? "identity-preserve-underlay"
        : "single-composite-segmentation",
      role: name,
    })),
  };
}

async function withFixture(run) {
  const projectRoot = await mkdtemp(join(tmpdir(), "coherent-mouth-audit-"));
  try {
    const assetRoot = join(projectRoot, "assets", "interviewer-rigging", "existing-look-cubism-v6");
    await mkdir(assetRoot, { recursive: true });
    await mkdir(join(projectRoot, "v5"), { recursive: true });
    const hashes = {};
    for (const key of V5_KEYS) {
      const bytes = Buffer.from(`locked-${key}`);
      await writeFile(join(projectRoot, "v5", `${key}.bin`), bytes);
      hashes[key] = sha256(bytes);
    }
    const manifestPath = join(assetRoot, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(createManifest(hashes)));
    await run({ assetRoot, manifestPath, projectRoot });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

test("unit: validates the V6 contract and locked V5 hashes", async () => {
  await withFixture(async ({ manifestPath, projectRoot }) => {
    const audit = await auditCoherentMouthSource({
      manifestPath,
      projectRoot,
      verifyPackageAssets: false,
    });

    assert.deepEqual(audit.canvas, { width: 1024, height: 1536 });
    assert.deepEqual(audit.mouthAnchor, { x: 512, y: 585 });
    assert.deepEqual(audit.editRegion, { left: 400, top: 530, right: 625, bottom: 675 });
    assert.deepEqual(audit.layerNames, EXPECTED_LAYER_NAMES);
    assert.equal(audit.v5Preserved, true);
  });
});

test("unit: rejects a changed V5 preservation file", async () => {
  await withFixture(async ({ manifestPath, projectRoot }) => {
    await writeFile(join(projectRoot, "v5", "moc3.bin"), "changed");

    await assert.rejects(
      auditCoherentMouthSource({
        manifestPath,
        projectRoot,
        verifyPackageAssets: false,
      }),
      /V5 preservation hash mismatch for moc3/,
    );
  });
});

test("unit: rejects an invalid coherent mouth contract", async () => {
  await withFixture(async ({ manifestPath, projectRoot }) => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.mouthAnchor.x = 511;
    await writeFile(manifestPath, JSON.stringify(manifest));

    await assert.rejects(
      auditCoherentMouthSource({
        manifestPath,
        projectRoot,
        verifyPackageAssets: false,
      }),
      /mouthAnchor must be exactly/,
    );
  });
});

test("production: V6 manifest locks the current V5 proof", async () => {
  const audit = await auditCoherentMouthSource({
    manifestPath: resolve(PROJECT_ROOT, "assets/interviewer-rigging/existing-look-cubism-v6/manifest.json"),
    verifyPackageAssets: false,
  });

  assert.deepEqual(audit.layerNames, EXPECTED_LAYER_NAMES);
  assert.equal(audit.v5Preserved, true);
});

test("production: V6 coherent source geometry and PSD payload pass", async () => {
  const audit = await auditCoherentMouthSource({
    manifestPath: resolve(PROJECT_ROOT, "assets/interviewer-rigging/existing-look-cubism-v6/manifest.json"),
  });

  assert.ok(Math.abs(audit.centerX - 512) <= 2);
  assert.ok(audit.widthRatio >= 0.95);
  assert.ok(audit.widthRatio <= 1.05);
  assert.ok(audit.cornerYDelta <= 3);
  assert.ok(audit.upperLipTeethGap <= 1);
  assert.equal(audit.uncoveredOpeningPixels, 0);
  assert.equal(audit.tongueOutsideInteriorPixels, 0);
  assert.equal(audit.overlappingSemanticPixels, 0);
  assert.ok(audit.upperTeethHeightRatio >= 0.20);
  assert.ok(audit.upperTeethHeightRatio <= 0.25);
  assert.equal(audit.lowerTeethLikePixels, 0);
  assert.ok(audit.recompositionMaxChannelDelta <= 1);
  assert.deepEqual(audit.psdLayerNames, EXPECTED_LAYER_NAMES);
  assert.equal(audit.psdPixelsVerified, true);
});
