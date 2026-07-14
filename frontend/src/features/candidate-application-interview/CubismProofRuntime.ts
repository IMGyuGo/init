import {
  CUBISM_PROOF_MODEL_URL,
  initializeCubismSdk,
  resolveCubismProofModelReferences,
  type CubismModelManifest,
} from "./CubismSdkRuntime";

const CUBISM_SHADER_PATH = "/assets/interviewer-cubism/sdk/shaders/";
const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_RENDER_FPS = 30;

export interface CubismProofRenderer {
  diagnostic: CubismProofDiagnostic;
  setMouthOpen(value: number): void;
  release(): void;
}

export type CubismProofDiagnostic = {
  parameterIndex: number;
  drawables: Array<{
    id: string;
    opacityAt0: number;
    opacityAt1: number;
    widthAt0: number;
    widthAt1: number;
    heightAt0: number;
    heightAt1: number;
  }>;
};

function clampMouthOpen(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

async function fetchRequired(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cubism asset request failed: ${url} (${response.status})`);
  return response;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Cubism texture failed to load: ${url}`)), {
      once: true,
    });
    image.src = url;
  });
}

async function createTexture(
  gl: WebGLRenderingContext,
  url: string,
): Promise<WebGLTexture> {
  const image = await loadImage(url);
  const texture = gl.createTexture();
  if (!texture) throw new Error(`Cubism texture allocation failed: ${url}`);

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

function resizeCanvas(canvas: HTMLCanvasElement): boolean {
  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
  const width = Math.max(1, Math.round((canvas.clientWidth || 560) * devicePixelRatio));
  const height = Math.max(1, Math.round((canvas.clientHeight || 840) * devicePixelRatio));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}

export async function createCubismProofRenderer(
  canvas: HTMLCanvasElement,
  initialMouthOpen = 0,
): Promise<CubismProofRenderer> {
  const availability = await initializeCubismSdk(canvas.ownerDocument, true);
  if (availability.kind !== "ready") {
    throw new Error(`Cubism SDK is not ready: ${availability.kind}`);
  }

  resizeCanvas(canvas);
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  });
  if (!gl) throw new Error("WebGL context is unavailable");

  const [modelResponse, userModelModule, matrixModule, frameworkModule] = await Promise.all([
    fetchRequired(CUBISM_PROOF_MODEL_URL),
    import("../../../vendor/CubismWebFramework/dist/model/cubismusermodel.js"),
    import("../../../vendor/CubismWebFramework/dist/math/cubismmatrix44.js"),
    import("../../../vendor/CubismWebFramework/dist/live2dcubismframework.js"),
  ]);
  const manifest = await modelResponse.json() as CubismModelManifest;
  const references = resolveCubismProofModelReferences(CUBISM_PROOF_MODEL_URL, manifest);
  const [mocResponse, ...textureResponses] = await Promise.all([
    fetchRequired(references.mocUrl),
    ...references.textureUrls.map(fetchRequired),
  ]);
  const mocBytes = await mocResponse.arrayBuffer();

  // Texture responses are requested above so missing deployment files fail before WebGL setup continues.
  await Promise.all(textureResponses.map((response) => response.arrayBuffer()));

  const userModel = new userModelModule.CubismUserModel();
  userModel.loadModel(mocBytes, true);
  const model = userModel.getModel();
  if (!model) {
    userModel.release();
    throw new Error("Cubism proof model could not be created from the MOC3 file");
  }

  userModel.createRenderer(canvas.width, canvas.height);
  const renderer = userModel.getRenderer();
  renderer.startUp(gl);
  renderer.setIsPremultipliedAlpha(true);
  renderer.loadShaders(CUBISM_SHADER_PATH);

  const textures = await Promise.all(references.textureUrls.map((url) => createTexture(gl, url)));
  textures.forEach((texture, index) => renderer.bindTexture(index, texture));

  const mouthParameterId = frameworkModule.CubismFramework.getIdManager().getId("ParamMouthOpenY");
  const parameterIndex = model.getParameterIndex(mouthParameterId);
  const captureDrawableState = (value: number) => {
    model.setParameterValueById(mouthParameterId, value);
    model.update();
    return Array.from({ length: model.getDrawableCount() }, (_, index) => {
      const vertices = model.getDrawableVertices(index);
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (let offset = 0; offset < vertices.length; offset += 2) {
        minX = Math.min(minX, vertices[offset]);
        maxX = Math.max(maxX, vertices[offset]);
        minY = Math.min(minY, vertices[offset + 1]);
        maxY = Math.max(maxY, vertices[offset + 1]);
      }
      return {
        id: model.getDrawableId(index).getString(),
        opacity: model.getDrawableOpacity(index),
        width: maxX - minX,
        height: maxY - minY,
      };
    });
  };
  const stateAt0 = captureDrawableState(0);
  const stateAt1 = captureDrawableState(1);
  const diagnostic: CubismProofDiagnostic = {
    parameterIndex,
    drawables: stateAt0.map((drawable, index) => ({
      id: drawable.id,
      opacityAt0: Math.round(drawable.opacity * 1000) / 1000,
      opacityAt1: Math.round(stateAt1[index].opacity * 1000) / 1000,
      widthAt0: Math.round(drawable.width * 1000) / 1000,
      widthAt1: Math.round(stateAt1[index].width * 1000) / 1000,
      heightAt0: Math.round(drawable.height * 1000) / 1000,
      heightAt1: Math.round(stateAt1[index].height * 1000) / 1000,
    })),
  };
  const modelMatrix = userModel.getModelMatrix();
  let mouthOpen = clampMouthOpen(initialMouthOpen);
  let frameId = 0;
  let lastFrameAt = 0;
  let released = false;

  const render = (now: number) => {
    if (released) return;
    if (now - lastFrameAt >= 1000 / MAX_RENDER_FPS) {
      lastFrameAt = now;
      if (resizeCanvas(canvas)) userModel.setRenderTargetSize(canvas.width, canvas.height);

      model.setParameterValueById(mouthParameterId, mouthOpen);
      model.update();

      const projection = new matrixModule.CubismMatrix44();
      if (model.getCanvasWidth() > 1 && canvas.width < canvas.height) {
        modelMatrix.setWidth(2);
        projection.scale(1, canvas.width / canvas.height);
      } else {
        modelMatrix.setHeight(2);
        projection.scale(canvas.height / canvas.width, 1);
      }
      projection.multiplyByMatrix(modelMatrix);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      renderer.setMvpMatrix(projection);
      renderer.setRenderState(
        gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer,
        [0, 0, canvas.width, canvas.height],
      );
      renderer.drawModel(CUBISM_SHADER_PATH);
    }
    frameId = window.requestAnimationFrame(render);
  };

  frameId = window.requestAnimationFrame(render);

  return {
    diagnostic,
    setMouthOpen(value) {
      mouthOpen = clampMouthOpen(value);
    },
    release() {
      if (released) return;
      released = true;
      window.cancelAnimationFrame(frameId);
      textures.forEach((texture) => gl.deleteTexture(texture));
      userModel.release();
    },
  };
}
