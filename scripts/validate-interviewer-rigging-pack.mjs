import { strict as assert } from "node:assert";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readPsd } from "../frontend/node_modules/ag-psd/dist/index.js";

const variants = ["existing-look", "rigged-look"];
const requiredCubismDraftLayers = [
  "back-hair",
  "torso",
  "face-neck",
  "eye-left-open",
  "eye-right-open",
  "eyes-closed",
  "mouth-rest",
  "mouth-closed",
  "mouth-open",
  "mouth-wide",
  "mouth-round",
  "mouth-teeth",
  "front-hair",
];

for (const variant of variants) {
  const manifestPath = `assets/interviewer-rigging/${variant}/manifest.json`;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifestDirectory = dirname(resolve(manifestPath));
  const expectedNames = manifest.layers.map((layer) => layer.name);

  for (const layerName of requiredCubismDraftLayers) {
    assert.ok(expectedNames.includes(layerName), `${variant} is missing ${layerName}`);
  }

  for (const layer of manifest.layers) {
    await access(resolve(manifestDirectory, layer.pngPath));
    await access(resolve(manifestDirectory, layer.rgbaPath));
  }

  const psdPath = resolve(manifestDirectory, "interviewer.psd");
  const psd = readPsd(await readFile(psdPath), {
    skipLayerImageData: true,
    skipCompositeImageData: true,
  });

  assert.equal(psd.width, manifest.canvas.width, `${variant} PSD width`);
  assert.equal(psd.height, manifest.canvas.height, `${variant} PSD height`);
  assert.deepEqual(psd.children?.map((layer) => layer.name), expectedNames, `${variant} PSD layer order`);

  console.log(`${variant}: ${psd.width}x${psd.height}, ${expectedNames.length} layers`);
}
