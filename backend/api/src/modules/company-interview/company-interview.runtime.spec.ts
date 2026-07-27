import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PackageJson = {
  scripts?: Record<string, string>;
};

describe('company interview API runtime', () => {
  it('keeps start:dev on the Nest CLI development runtime', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'),
    ) as PackageJson;

    expect(packageJson.scripts?.dev).toBe('nest start --watch');
    expect(packageJson.scripts?.['start:dev']).toBe('npm run dev');
  });
});
