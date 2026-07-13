import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { writePsd } from "../frontend/node_modules/ag-psd/dist/index.js";

const MASTER_WIDTH = 1024;
const MASTER_HEIGHT = 1536;

export async function buildInterviewerRiggingPsd({ manifestPath, outputPath }) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.canvas?.width !== MASTER_WIDTH || manifest.canvas?.height !== MASTER_HEIGHT) {
    throw new Error(`Rigging PSD canvas must be ${MASTER_WIDTH}x${MASTER_HEIGHT}.`);
  }
  if (!Array.isArray(manifest.layers) || manifest.layers.length === 0) {
    throw new Error("Rigging PSD requires at least one layer.");
  }

  const manifestDirectory = dirname(resolve(manifestPath));
  const children = await Promise.all(manifest.layers.map(async (layer) => {
    if (!layer.name || !layer.rgbaPath) {
      throw new Error("Each rigging layer requires a name and rgbaPath.");
    }
    const rgba = await readFile(resolve(manifestDirectory, layer.rgbaPath));
    const expectedLength = MASTER_WIDTH * MASTER_HEIGHT * 4;
    if (rgba.byteLength !== expectedLength) {
      throw new Error(`Layer ${layer.name} must contain ${expectedLength} RGBA bytes.`);
    }

    return {
      name: layer.name,
      hidden: layer.visible === false,
      top: 0,
      left: 0,
      bottom: MASTER_HEIGHT,
      right: MASTER_WIDTH,
      imageData: {
        data: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
        width: MASTER_WIDTH,
        height: MASTER_HEIGHT,
      },
    };
  }));

  const psd = writePsd({
    width: MASTER_WIDTH,
    height: MASTER_HEIGHT,
    children,
  });
  await writeFile(outputPath, Buffer.from(psd));
}
