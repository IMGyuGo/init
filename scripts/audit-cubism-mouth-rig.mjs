import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const EXPECTED_DRAWABLE_NAMES = [
  "MouthSkinUnderlay",
  "MouthInterior",
  "MouthUpperTeeth",
  "MouthTongue",
  "MouthUpperLip",
  "MouthLowerLip",
];
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function resolveInside(baseDirectory, reference) {
  const path = resolve(baseDirectory, reference);
  const relativePath = relative(baseDirectory, path);
  if (relativePath.startsWith("..") || resolve(path) === resolve(baseDirectory)) {
    throw new Error(`Cubism model reference leaves its directory: ${reference}`);
  }
  return path;
}

function instrumentCoreScript(source) {
  const marker = ",_em_module())}(Live2DCubismCore=Live2DCubismCore||{});";
  if (!source.includes(marker)) {
    throw new Error("unable to expose Cubism Core runtime module from checked-in script");
  }
  return source.replace(
    marker,
    ",(globalThis.__cubismCoreRuntimeModule=_em_module()))}(Live2DCubismCore=Live2DCubismCore||{});",
  );
}

async function loadCubismCore(coreScriptPath) {
  const source = instrumentCoreScript(await readFile(coreScriptPath, "utf8"));
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Buffer,
    TextDecoder,
    TextEncoder,
    setTimeout,
    clearTimeout,
    module: { exports: {} },
    exports: {},
    document: { currentScript: { src: coreScriptPath } },
    navigator: {},
    location: { href: `file:///${coreScriptPath.replaceAll("\\", "/")}` },
  };
  context.globalThis = context;
  context.self = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: coreScriptPath });

  const runtimeModule = context.__cubismCoreRuntimeModule;
  if (!runtimeModule || typeof runtimeModule.then !== "function") {
    throw new Error("Cubism Core runtime module was not initialized");
  }

  await new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => rejectReady(new Error("Cubism Core runtime initialization timed out")), 5000);
    runtimeModule.then(() => {
      clearTimeout(timeout);
      resolveReady();
    });
  });

  if (!context.Live2DCubismCore?.Moc || !context.Live2DCubismCore?.Model) {
    throw new Error("Cubism Core namespace is incomplete");
  }
  return context.Live2DCubismCore;
}

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function boundsFor(vertices) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < vertices.length; index += 2) {
    const x = vertices[index];
    const y = vertices[index + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    width: roundMetric(maxX - minX),
    height: roundMetric(maxY - minY),
    centerX: roundMetric((minX + maxX) / 2),
    centerY: roundMetric((minY + maxY) / 2),
  };
}

function uvBoundsFor(uvs) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let index = 0; index < uvs.length; index += 2) {
    minU = Math.min(minU, uvs[index]);
    maxU = Math.max(maxU, uvs[index]);
    minV = Math.min(minV, uvs[index + 1]);
    maxV = Math.max(maxV, uvs[index + 1]);
  }
  return [minU, minV, maxU, maxV].map(roundMetric);
}

function captureEndpoint(model, parameterIndex, value, drawableIndicesByName) {
  model.parameters.values[parameterIndex] = value;
  model.update();

  const endpoint = {};
  for (const [name, drawableIndex] of Object.entries(drawableIndicesByName)) {
    const bounds = boundsFor(model.drawables.vertexPositions[drawableIndex]);
    endpoint[name] = {
      opacity: roundMetric(model.drawables.opacities[drawableIndex]),
      width: bounds.width,
      height: bounds.height,
      centerX: bounds.centerX,
      centerY: bounds.centerY,
      textureUvBounds: uvBoundsFor(model.drawables.vertexUvs[drawableIndex]),
      maskIds: Array.from(model.drawables.masks[drawableIndex]).map(
        (maskIndex) => model.drawables.ids[maskIndex],
      ),
    };
  }
  return endpoint;
}

function buildDrawableDiagnostics(manifest, model, endpoint0, endpoint1, drawableIndicesByName) {
  const drawables = {};
  for (const name of EXPECTED_DRAWABLE_NAMES) {
    drawables[name] = {
      id: manifest.cubismRig.artMeshes[name],
      index: drawableIndicesByName[name],
      maskIds: endpoint1[name].maskIds,
      opacity: [endpoint0[name].opacity, endpoint1[name].opacity],
      width: [endpoint0[name].width, endpoint1[name].width],
      height: [endpoint0[name].height, endpoint1[name].height],
      centerX: [endpoint0[name].centerX, endpoint1[name].centerX],
      centerY: [endpoint0[name].centerY, endpoint1[name].centerY],
      textureUvBounds: endpoint1[name].textureUvBounds,
    };
  }
  return drawables;
}

export async function auditCubismMouthRig({
  manifestPath = resolve(PROJECT_ROOT, "assets/interviewer-rigging/existing-look-cubism-v5/manifest.json"),
  model3JsonPath = resolve(
    PROJECT_ROOT,
    "assets/interviewer-rigging/cubism-proof-archive/v5-layered-mouth-proof/interviewer-v5-layered-mouth-proof.model3.json",
  ),
  coreScriptPath = resolve(PROJECT_ROOT, "assets/interviewer-rigging/cubism-proof-archive/sdk/live2dcubismcore.min.js"),
} = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const model3 = JSON.parse(await readFile(model3JsonPath, "utf8"));
  const modelDirectory = dirname(model3JsonPath);
  const moc3Path = resolveInside(modelDirectory, model3.FileReferences?.Moc ?? "");
  const core = await loadCubismCore(coreScriptPath);
  const mocBytes = toArrayBuffer(await readFile(moc3Path));
  const moc = core.Moc.fromArrayBuffer(mocBytes);
  if (!moc) throw new Error(`failed to load Cubism MOC3: ${moc3Path}`);

  let model;
  try {
    model = core.Model.fromMoc(moc);
    if (!model) throw new Error(`failed to initialize Cubism model: ${moc3Path}`);

    const parameterId = manifest.mouthOpenParameter?.id ?? "ParamMouthOpenY";
    const parameterIndex = model.parameters.ids.indexOf(parameterId);
    if (parameterIndex < 0) throw new Error(`${parameterId} is missing from MOC3 parameters`);

    const drawableIndicesByName = {};
    for (const name of EXPECTED_DRAWABLE_NAMES) {
      const drawableId = manifest.cubismRig?.artMeshes?.[name];
      if (!drawableId) throw new Error(`manifest is missing ArtMesh ID for ${name}`);
      const drawableIndex = model.drawables.ids.indexOf(drawableId);
      if (drawableIndex < 0) throw new Error(`${name} (${drawableId}) is missing from MOC3 drawables`);
      drawableIndicesByName[name] = drawableIndex;
    }

    const endpoint0 = captureEndpoint(model, parameterIndex, 0, drawableIndicesByName);
    const endpoint1 = captureEndpoint(model, parameterIndex, 1, drawableIndicesByName);

    return {
      parameter: {
        id: parameterId,
        index: parameterIndex,
        range: [
          roundMetric(model.parameters.minimumValues[parameterIndex]),
          roundMetric(model.parameters.maximumValues[parameterIndex]),
        ],
        defaultValue: roundMetric(model.parameters.defaultValues[parameterIndex]),
      },
      drawables: buildDrawableDiagnostics(manifest, model, endpoint0, endpoint1, drawableIndicesByName),
      parameterBindings: {
        deformers:
          manifest.cubismRig?.parameterBindings?.[parameterId]?.deformers ?? [],
        keyforms:
          manifest.cubismRig?.parameterBindings?.[parameterId]?.keyforms ?? [],
      },
    };
  } finally {
    if (model) model.release();
    moc._release();
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === resolve(currentFilePath)) {
  const readArgument = (name) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  const manifestPath = readArgument("--manifest");
  const model3JsonPath = readArgument("--model");
  const coreScriptPath = readArgument("--core");
  const result = await auditCubismMouthRig({
    ...(manifestPath ? { manifestPath: resolve(manifestPath) } : {}),
    ...(model3JsonPath ? { model3JsonPath: resolve(model3JsonPath) } : {}),
    ...(coreScriptPath ? { coreScriptPath: resolve(coreScriptPath) } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
