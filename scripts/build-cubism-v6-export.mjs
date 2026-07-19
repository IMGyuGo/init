import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "../frontend/node_modules/sharp/lib/index.js";
import { auditCubismMouthRig } from "./audit-cubism-mouth-rig.mjs";


const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEXTURE_SIZE = 2048;
const V5_ASSET_ROOT = resolve(PROJECT_ROOT, "assets/interviewer-rigging/existing-look-cubism-v5");
const V6_ASSET_ROOT = resolve(PROJECT_ROOT, "assets/interviewer-rigging/existing-look-cubism-v6");
const V5_EXPORT_ROOT = resolve(
  PROJECT_ROOT,
  "assets/interviewer-rigging/cubism-proof-archive/v5-layered-mouth-proof",
);
const V6_EXPORT_ROOT = resolve(
  PROJECT_ROOT,
  "assets/interviewer-rigging/cubism-proof-archive/v6-coherent-mouth-proof",
);
const V5_MODEL_NAME = "interviewer-v5-layered-mouth-proof";
const V6_MODEL_NAME = "interviewer-v6-coherent-mouth-proof";
const DRAWABLE_TO_LAYER = {
  MouthSkinUnderlay: "mouth-skin-underlay",
  MouthInterior: "mouth-interior",
  MouthUpperTeeth: "mouth-upper-teeth",
  MouthTongue: "mouth-tongue",
  MouthUpperLip: "mouth-upper-lip",
  MouthLowerLip: "mouth-lower-lip",
};


export function uvBoundsToTextureRect([minU, minV, maxU, maxV], textureSize) {
  const left = Math.floor(minU * textureSize);
  const right = Math.ceil(maxU * textureSize);
  const top = Math.floor((1 - maxV) * textureSize);
  const bottom = Math.ceil((1 - minV) * textureSize);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function layerTransformFor(drawableName) {
  return { rotate: drawableName === "MouthUpperTeeth" ? 90 : 0 };
}

async function resizedLayer(path, rect, transform) {
  let pipeline = sharp(path).ensureAlpha();
  if (transform.rotate) pipeline = pipeline.rotate(transform.rotate);
  const { data, info } = await pipeline
    .resize(rect.width, rect.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== rect.width || info.height !== rect.height || info.channels !== 4) {
    throw new Error(`unexpected resized layer dimensions for ${path}`);
  }
  return data;
}

function overwriteRect(texture, layer, rect, textureSize) {
  const rowBytes = rect.width * 4;
  for (let y = 0; y < rect.height; y += 1) {
    const sourceOffset = y * rowBytes;
    const targetOffset = ((rect.top + y) * textureSize + rect.left) * 4;
    layer.copy(texture, targetOffset, sourceOffset, sourceOffset + rowBytes);
  }
}

export async function repackV6Texture({
  v5TexturePath,
  v6TexturePath,
  diagnostics,
  v6AssetRoot = V6_ASSET_ROOT,
}) {
  const { data, info } = await sharp(v5TexturePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== TEXTURE_SIZE || info.height !== TEXTURE_SIZE || info.channels !== 4) {
    throw new Error("V5 Cubism texture must be 2048x2048 RGBA");
  }
  const texture = Buffer.from(data);
  const layerRecords = {};
  for (const [drawableName, layerName] of Object.entries(DRAWABLE_TO_LAYER)) {
    const uvBounds = diagnostics.drawables[drawableName]?.textureUvBounds;
    if (!uvBounds) throw new Error(`missing UV bounds for ${drawableName}`);
    const rect = uvBoundsToTextureRect(uvBounds, TEXTURE_SIZE);
    const transform = layerTransformFor(drawableName);
    const layer = await resizedLayer(
      resolve(v6AssetRoot, "normalized", `${layerName}.png`),
      rect,
      transform,
    );
    overwriteRect(texture, layer, rect, TEXTURE_SIZE);
    layerRecords[drawableName] = { layerName, rect, ...transform };
  }

  await mkdir(dirname(v6TexturePath), { recursive: true });
  await sharp(texture, {
    raw: { width: TEXTURE_SIZE, height: TEXTURE_SIZE, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(v6TexturePath);
  return layerRecords;
}

export async function verifyV6TextureRepack({
  manifestPath = resolve(V6_ASSET_ROOT, "manifest.json"),
  texturePath = resolve(V6_EXPORT_ROOT, `${V6_MODEL_NAME}.2048/texture_00.png`),
  v6AssetRoot = V6_ASSET_ROOT,
} = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const { data, info } = await sharp(texturePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== TEXTURE_SIZE || info.height !== TEXTURE_SIZE || info.channels !== 4) {
    throw new Error("V6 Cubism texture must be 2048x2048 RGBA");
  }

  const verified = [];
  for (const [drawableName, record] of Object.entries(manifest.textureRepack?.layers ?? {})) {
    const expected = await resizedLayer(
      resolve(v6AssetRoot, "normalized", `${record.layerName}.png`),
      record.rect,
      { rotate: record.rotate },
    );
    const rowBytes = record.rect.width * 4;
    for (let y = 0; y < record.rect.height; y += 1) {
      const textureOffset = ((record.rect.top + y) * TEXTURE_SIZE + record.rect.left) * 4;
      const expectedOffset = y * rowBytes;
      if (!data.subarray(textureOffset, textureOffset + rowBytes).equals(
        expected.subarray(expectedOffset, expectedOffset + rowBytes),
      )) {
        throw new Error(`${drawableName} V6 texture slot differs from its normalized layer`);
      }
    }
    verified.push(drawableName);
  }
  if (verified.length !== Object.keys(DRAWABLE_TO_LAYER).length) {
    throw new Error("V6 texture repack does not contain all mouth drawables");
  }
  return { textureSize: TEXTURE_SIZE, verified };
}

function updateDisplayInfo(v5DisplayInfo) {
  return {
    ...v5DisplayInfo,
    Parts: (v5DisplayInfo.Parts ?? []).map((part) => ({
      ...part,
      Name: String(part.Name ?? "").replace(
        "interviewer-mouth-v5.psd",
        "interviewer-mouth-v6.psd",
      ),
    })),
  };
}

function updateModel3(v5Model3) {
  return {
    ...v5Model3,
    FileReferences: {
      ...v5Model3.FileReferences,
      Moc: `${V6_MODEL_NAME}.moc3`,
      Textures: [`${V6_MODEL_NAME}.2048/texture_00.png`],
      DisplayInfo: `${V6_MODEL_NAME}.cdi3.json`,
    },
    Groups: (v5Model3.Groups ?? []).map((group) => (
      group.Target === "Parameter" && group.Name === "LipSync"
        ? { ...group, Ids: ["ParamMouthOpenY"] }
        : group
    )),
  };
}

export async function buildCubismV6Export() {
  const v5ManifestPath = resolve(V5_ASSET_ROOT, "manifest.json");
  const v6ManifestPath = resolve(V6_ASSET_ROOT, "manifest.json");
  const v5Model3Path = resolve(V5_EXPORT_ROOT, `${V5_MODEL_NAME}.model3.json`);
  const v5Moc3Path = resolve(V5_EXPORT_ROOT, `${V5_MODEL_NAME}.moc3`);
  const v5Cdi3Path = resolve(V5_EXPORT_ROOT, `${V5_MODEL_NAME}.cdi3.json`);
  const v5TexturePath = resolve(V5_EXPORT_ROOT, `${V5_MODEL_NAME}.2048/texture_00.png`);

  const v6Model3Path = resolve(V6_EXPORT_ROOT, `${V6_MODEL_NAME}.model3.json`);
  const v6Moc3Path = resolve(V6_EXPORT_ROOT, `${V6_MODEL_NAME}.moc3`);
  const v6Cdi3Path = resolve(V6_EXPORT_ROOT, `${V6_MODEL_NAME}.cdi3.json`);
  const v6TexturePath = resolve(V6_EXPORT_ROOT, `${V6_MODEL_NAME}.2048/texture_00.png`);
  const v6BasePath = resolve(V6_EXPORT_ROOT, `${V6_MODEL_NAME}-base.png`);
  const v6Cmo3Path = resolve(V6_ASSET_ROOT, "interviewer-import-v6.cmo3");

  const diagnostics = await auditCubismMouthRig({
    manifestPath: v5ManifestPath,
    model3JsonPath: v5Model3Path,
  });
  const [v5Manifest, v6Manifest, v5Model3, v5DisplayInfo] = await Promise.all([
    readFile(v5ManifestPath, "utf8").then(JSON.parse),
    readFile(v6ManifestPath, "utf8").then(JSON.parse),
    readFile(v5Model3Path, "utf8").then(JSON.parse),
    readFile(v5Cdi3Path, "utf8").then(JSON.parse),
  ]);

  await mkdir(V6_EXPORT_ROOT, { recursive: true });
  await Promise.all([
    copyFile(resolve(V5_ASSET_ROOT, "interviewer-import-v5.cmo3"), v6Cmo3Path),
    copyFile(v5Moc3Path, v6Moc3Path),
    copyFile(resolve(V6_ASSET_ROOT, "../existing-look/normalized/master.png"), v6BasePath),
  ]);
  const layerRecords = await repackV6Texture({
    v5TexturePath,
    v6TexturePath,
    diagnostics,
  });

  const model3 = updateModel3(v5Model3);
  const displayInfo = updateDisplayInfo(v5DisplayInfo);
  await Promise.all([
    writeFile(v6Model3Path, `${JSON.stringify(model3, null, "\t")}\n`, "utf8"),
    writeFile(v6Cdi3Path, `${JSON.stringify(displayInfo, null, "\t")}\n`, "utf8"),
  ]);

  const nextManifest = {
    ...v6Manifest,
    status: "cubism-v6-exported",
    derivedFrom: "../existing-look-cubism-v5/interviewer-import-v5.cmo3",
    sourceCmo3Path: "interviewer-import-v6.cmo3",
    sourceModelStrategy: {
      type: "preserve-v5-rig-repack-v6-texture",
      rigSource: "../existing-look-cubism-v5/interviewer-import-v5.cmo3",
      rasterSource: "interviewer-mouth-v6.psd",
      reason: "V5 already contains the approved six-ArtMesh child-deformer rig",
    },
    mouthOpenParameter: v5Manifest.mouthOpenParameter,
    cubismRig: {
      ...v5Manifest.cubismRig,
      runtimeOpacityGate: {
        MouthInterior: { hiddenAtOrBelow: 0, fullyVisibleAtOrAbove: 0.55 },
        MouthTongue: { hiddenAtOrBelow: 0.2, fullyVisibleAtOrAbove: 0.75 },
        MouthUpperTeeth: { hiddenAtOrBelow: 0.55, fullyVisibleAtOrAbove: 0.85 },
      },
    },
    textureRepack: {
      textureSize: TEXTURE_SIZE,
      sourceTexture: v5Manifest.webExport.texturePath,
      layers: layerRecords,
    },
    webExport: {
      directory: "assets/interviewer-rigging/cubism-proof-archive/v6-coherent-mouth-proof",
      modelName: V6_MODEL_NAME,
      model3JsonPath:
        `assets/interviewer-rigging/cubism-proof-archive/v6-coherent-mouth-proof/${V6_MODEL_NAME}.model3.json`,
      moc3Path:
        `assets/interviewer-rigging/cubism-proof-archive/v6-coherent-mouth-proof/${V6_MODEL_NAME}.moc3`,
      baseImagePath:
        `assets/interviewer-rigging/cubism-proof-archive/v6-coherent-mouth-proof/${V6_MODEL_NAME}-base.png`,
      displayInfoPath:
        `assets/interviewer-rigging/cubism-proof-archive/v6-coherent-mouth-proof/${V6_MODEL_NAME}.cdi3.json`,
      texturePath:
        `assets/interviewer-rigging/cubism-proof-archive/v6-coherent-mouth-proof/${V6_MODEL_NAME}.2048/texture_00.png`,
      textureSize: TEXTURE_SIZE,
      fileReferences: model3.FileReferences,
    },
  };
  await writeFile(v6ManifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  return {
    modelName: V6_MODEL_NAME,
    outputDirectory: V6_EXPORT_ROOT,
    layerRecords,
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === resolve(currentFilePath)) {
  const result = await buildCubismV6Export();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
