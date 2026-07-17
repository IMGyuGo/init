export { getMouthOpenValueForShape as getCubismMouthOpenValue } from "./LipSyncDriver";

export const CUBISM_CORE_SCRIPT_SRC = "/assets/interviewer-cubism/sdk/live2dcubismcore.min.js";
export const CUBISM_PROOF_MODEL_URL =
  "/assets/interviewer-cubism/v6-coherent-mouth-proof/interviewer-v6-coherent-mouth-proof.model3.json";

export type CubismMouthLayerVisibility = {
  interior: number;
  tongue: number;
  upperTeeth: number;
};

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
}

export function getCubismMouthLayerVisibility(value: number): CubismMouthLayerVisibility {
  const mouthOpen = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return {
    interior: smoothstep(0, 0.55, mouthOpen),
    tongue: smoothstep(0.2, 0.75, mouthOpen),
    upperTeeth: smoothstep(0.55, 0.85, mouthOpen),
  };
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
    textureUrls: manifest.FileReferences.Textures.map(resolveReference),
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
