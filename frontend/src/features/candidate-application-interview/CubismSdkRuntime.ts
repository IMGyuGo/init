import type { MouthShape } from "./LipSyncDriver";

export { getMouthOpenValueForShape as getCubismMouthOpenValue } from "./LipSyncDriver";

export type CubismMouthOpacityCrossfade = {
  parameterId: "ParamMouthOpenY";
  controlType: "opacity-crossfade";
  deformationType: "reference-opacity-crossfade";
  layers: {
    "mouth-rest": number;
    "mouth-open-reference": number;
  };
};

export function resolveCubismMouthOpacityCrossfade(mouthOpenValue: number): CubismMouthOpacityCrossfade {
  const openOpacity = Number.isFinite(mouthOpenValue)
    ? Math.min(1, Math.max(0, mouthOpenValue))
    : 0;
  return {
    parameterId: "ParamMouthOpenY",
    controlType: "opacity-crossfade",
    deformationType: "reference-opacity-crossfade",
    layers: {
      "mouth-rest": 1 - openOpacity,
      "mouth-open-reference": openOpacity,
    },
  };
}

export const CUBISM_CORE_SCRIPT_SRC = "/assets/interviewer-cubism/sdk/live2dcubismcore.min.js";
export const CUBISM_PROOF_MODEL_URL =
  "/assets/interviewer-cubism/v6-coherent-mouth-proof/interviewer-v6-coherent-mouth-proof.model3.json";
const CUBISM_PROOF_TEXTURE_REVISION = "coherent-composite-v16";

export type CubismSpeakingMouthShape = "open" | "wide" | "round" | "teeth";

export type CubismMouthTextureUrls = Record<CubismSpeakingMouthShape, string>;

export type CubismCanvasRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const CUBISM_COMPOSITE_MOUTH_CANVAS_RECT: CubismCanvasRect = {
  left: 466,
  top: 562,
  width: 114,
  height: 61,
};

export function remapCubismFullCanvasDrawableToRect(
  sourceVertices: Float32Array,
  rect: CubismCanvasRect,
  canvas: { width: number; height: number },
): Float32Array {
  if (sourceVertices.length < 8 || sourceVertices.length % 2 !== 0) {
    throw new Error("Cubism drawable vertices must contain at least four XY pairs");
  }
  if (canvas.width <= 0 || canvas.height <= 0 || rect.width <= 0 || rect.height <= 0) {
    throw new Error("Cubism drawable canvas and target rect must be positive");
  }

  const xs = Array.from(sourceVertices).filter((_, index) => index % 2 === 0);
  const ys = Array.from(sourceVertices).filter((_, index) => index % 2 === 1);
  const sourceLeft = Math.min(...xs);
  const sourceRight = Math.max(...xs);
  const sourceBottom = Math.min(...ys);
  const sourceTop = Math.max(...ys);
  const sourceWidth = sourceRight - sourceLeft;
  const sourceHeight = sourceTop - sourceBottom;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Cubism drawable vertices must span a non-empty rectangle");
  }

  const targetLeft = sourceLeft + sourceWidth * rect.left / canvas.width;
  const targetRight = sourceLeft + sourceWidth * (rect.left + rect.width) / canvas.width;
  const targetBottom = sourceBottom
    + sourceHeight * (canvas.height - rect.top - rect.height) / canvas.height;
  const targetTop = sourceBottom + sourceHeight * (canvas.height - rect.top) / canvas.height;
  const remapped = new Float32Array(sourceVertices.length);
  for (let index = 0; index < sourceVertices.length; index += 2) {
    const horizontalRatio = (sourceVertices[index] - sourceLeft) / sourceWidth;
    const verticalRatio = (sourceVertices[index + 1] - sourceBottom) / sourceHeight;
    remapped[index] = targetLeft + (targetRight - targetLeft) * horizontalRatio;
    remapped[index + 1] = targetBottom + (targetTop - targetBottom) * verticalRatio;
  }
  return remapped;
}

export function getCubismMouthTextureUrls(defaultTextureUrl: string): CubismMouthTextureUrls {
  const suffixIndex = defaultTextureUrl.search(/[?#]/);
  const path = suffixIndex === -1 ? defaultTextureUrl : defaultTextureUrl.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : defaultTextureUrl.slice(suffixIndex);
  if (!path.endsWith(".png")) {
    throw new Error("Cubism mouth texture URL must end with .png");
  }
  const variantUrl = (shape: Exclude<CubismSpeakingMouthShape, "open">) => (
    `${path.slice(0, -4)}-${shape}.png${suffix}`
  );
  return {
    open: defaultTextureUrl,
    wide: variantUrl("wide"),
    round: variantUrl("round"),
    teeth: variantUrl("teeth"),
  };
}

export function getCubismMouthTextureShape(mouthShape: MouthShape): CubismSpeakingMouthShape {
  if (mouthShape === "wide" || mouthShape === "round" || mouthShape === "teeth") {
    return mouthShape;
  }
  return "open";
}

export type CubismMouthLayerVisibility = {
  modelMouthOpen: number;
  restBase: number;
  lowerLip: number;
  interior: number;
  skinUnderlay: number;
  tongue: number;
  upperLip: number;
  upperTeeth: number;
};

export type CubismMouthPose = CubismMouthLayerVisibility & {
  mouthShape: MouthShape;
  modelMouthForm: number;
};

export function getCubismMouthLayerVisibility(value: number): CubismMouthLayerVisibility {
  const mouthOpen = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return {
    modelMouthOpen: mouthOpen,
    restBase: 0,
    lowerLip: 0,
    interior: 0,
    skinUnderlay: 1,
    tongue: 0,
    upperLip: 0,
    upperTeeth: 0,
  };
}

export function getCubismCompositeMouthVerticalScale(value: number): number {
  const mouthOpen = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return 0.75 + mouthOpen * 0.25;
}

export function getCubismMouthPose(mouthShape: MouthShape, value: number): CubismMouthPose {
  if (mouthShape === "rest") {
    return {
      mouthShape,
      modelMouthOpen: 0,
      modelMouthForm: 0,
      restBase: 0,
      lowerLip: 0,
      interior: 0,
      skinUnderlay: 0,
      tongue: 0,
      upperLip: 0,
      upperTeeth: 0,
    };
  }
  if (mouthShape === "closed") {
    return {
      mouthShape,
      modelMouthOpen: 0,
      modelMouthForm: 0,
      restBase: 0,
      lowerLip: 0,
      interior: 0,
      skinUnderlay: 0,
      tongue: 0,
      upperLip: 0,
      upperTeeth: 0,
    };
  }

  const mouthOpen = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const visibility = getCubismMouthLayerVisibility(mouthOpen);
  const modelMouthForm = mouthShape === "wide"
    ? 1
    : mouthShape === "round"
      ? -1
      : mouthShape === "teeth"
        ? 0.35
        : 0;
  if (mouthShape === "teeth") {
    return {
      ...visibility,
      mouthShape,
      modelMouthOpen: Math.min(0.55, mouthOpen),
      modelMouthForm,
      tongue: 0,
      upperTeeth: 0,
    };
  }
  return { ...visibility, mouthShape, modelMouthForm };
}

export type CubismModelManifest = {
  Version: number;
  FileReferences: {
    Moc: string;
    Textures: string[];
  };
};

export type CubismProofModelReferences = {
  mocUrl: string;
  textureUrls: string[];
};

export type CubismRuntimeAvailability =
  | { kind: "fallback"; reason: "webgl-unavailable" | "core-unavailable" | "framework-initialization-failed" }
  | { kind: "waiting-model" }
  | { kind: "ready" };

export interface CubismRuntimeAvailabilityInput {
  hasWebGl: boolean;
  hasCore: boolean;
  hasModel: boolean;
}

type CubismCoreWindow = Window & {
  Live2DCubismCore?: unknown;
};

let frameworkInitialization: Promise<boolean> | undefined;

export function resolveCubismProofModelReferences(
  modelUrl: string,
  manifest: CubismModelManifest,
): CubismProofModelReferences {
  if (manifest.Version !== 3 || !manifest.FileReferences?.Moc || !manifest.FileReferences.Textures?.length) {
    throw new Error("Cubism proof model manifest is incomplete");
  }

  const baseOrigin = "https://cubism.local";
  const absoluteModelUrl = new URL(modelUrl, baseOrigin);
  const modelDirectory = absoluteModelUrl.pathname.slice(0, absoluteModelUrl.pathname.lastIndexOf("/") + 1);
  const resolveReference = (reference: string) => {
    const resolved = new URL(reference, absoluteModelUrl);
    if (resolved.origin !== absoluteModelUrl.origin || !resolved.pathname.startsWith(modelDirectory)) {
      throw new Error("Cubism proof model references must stay inside the model directory");
    }
    return resolved.pathname;
  };

  return {
    mocUrl: resolveReference(manifest.FileReferences.Moc),
    textureUrls: manifest.FileReferences.Textures.map(
      (reference) => `${resolveReference(reference)}?v=${CUBISM_PROOF_TEXTURE_REVISION}`,
    ),
  };
}

export function getCubismRuntimeAvailability({
  hasWebGl,
  hasCore,
  hasModel,
}: CubismRuntimeAvailabilityInput): CubismRuntimeAvailability {
  if (!hasWebGl) return { kind: "fallback", reason: "webgl-unavailable" };
  if (!hasCore) return { kind: "fallback", reason: "core-unavailable" };
  if (!hasModel) return { kind: "waiting-model" };
  return { kind: "ready" };
}

export async function initializeCubismSdk(document: Document, hasModel: boolean): Promise<CubismRuntimeAvailability> {
  if (!supportsWebGl(document)) {
    return getCubismRuntimeAvailability({ hasWebGl: false, hasCore: false, hasModel });
  }

  const coreLoaded = await loadCubismCore(document);
  if (!coreLoaded) {
    return getCubismRuntimeAvailability({ hasWebGl: true, hasCore: false, hasModel });
  }

  const frameworkReady = await initializeCubismFramework();
  if (!frameworkReady) {
    return { kind: "fallback", reason: "framework-initialization-failed" };
  }

  return getCubismRuntimeAvailability({ hasWebGl: true, hasCore: true, hasModel });
}

function supportsWebGl(document: Document): boolean {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
}

async function loadCubismCore(document: Document): Promise<boolean> {
  const view = document.defaultView as CubismCoreWindow | null;
  if (view?.Live2DCubismCore) return true;

  const existing = document.querySelector<HTMLScriptElement>('script[data-cubism-core="r5"]');
  if (existing) {
    return awaitScript(existing, document);
  }

  const script = document.createElement("script");
  script.async = true;
  script.dataset.cubismCore = "r5";
  script.src = CUBISM_CORE_SCRIPT_SRC;
  document.head.append(script);
  return awaitScript(script, document);
}

function awaitScript(script: HTMLScriptElement, document: Document): Promise<boolean> {
  const view = document.defaultView as CubismCoreWindow | null;
  if (view?.Live2DCubismCore) return Promise.resolve(true);

  return new Promise((resolve) => {
    script.addEventListener("load", () => resolve(Boolean((document.defaultView as CubismCoreWindow | null)?.Live2DCubismCore)), { once: true });
    script.addEventListener("error", () => resolve(false), { once: true });
  });
}

async function initializeCubismFramework(): Promise<boolean> {
  frameworkInitialization ??= (async () => {
    try {
      const framework = await import("../../../vendor/CubismWebFramework/dist/live2dcubismframework.js");
      if (!framework.CubismFramework.isStarted()) framework.CubismFramework.startUp();
      if (!framework.CubismFramework.isInitialized()) framework.CubismFramework.initialize();
      return true;
    } catch {
      return false;
    }
  })();

  return frameworkInitialization;
}
