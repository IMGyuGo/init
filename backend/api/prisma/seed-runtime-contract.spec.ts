import { readFileSync } from "fs";
import { join } from "path";

describe("seed runtime contract", () => {
  it("does not import source-only files omitted from the production API image", () => {
    const seedSource = readFileSync(join(__dirname, "seed.ts"), "utf8");

    expect(seedSource).not.toMatch(/from\s+["']\.\.\/src\//);
  });
});
