import { strict as assert } from "node:assert";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPsd } from "../frontend/node_modules/ag-psd/dist/index.js";
import { buildInterviewerRiggingPsd } from "./build-interviewer-rigging-psd.mjs";

const workspace = await mkdtemp(join(tmpdir(), "interviewer-rigging-"));
const manifestPath = join(workspace, "manifest.json");
const outputPath = join(workspace, "interviewer.psd");

const rgbaPath = join(workspace, "face.rgba");
const rgba = Buffer.alloc(1024 * 1536 * 4);
rgba[0] = 120;
rgba[1] = 90;
rgba[2] = 60;
rgba[3] = 255;
await writeFile(rgbaPath, rgba);

await writeFile(manifestPath, JSON.stringify({
  canvas: { width: 1024, height: 1536 },
  layers: [{
    name: "face-neck",
    rgbaPath: "face.rgba",
    visible: true,
  }],
}), "utf8");

await buildInterviewerRiggingPsd({ manifestPath, outputPath });

const output = await readFile(outputPath);
assert.ok(output.byteLength > 0);
const psd = readPsd(output, {
  skipLayerImageData: true,
  skipCompositeImageData: true,
});
assert.equal(psd.width, 1024);
assert.equal(psd.height, 1536);
assert.equal(psd.children?.[0]?.name, "face-neck");
