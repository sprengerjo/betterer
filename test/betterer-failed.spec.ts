import { betterer } from '@betterer/betterer';
import { promises as fs } from 'fs';

import { createFixture } from './fixture';

describe('betterer', () => {
  it(`should work when a test fails`, async () => {
    const { logs, paths, readFile, cleanup } = await createFixture('test-betterer-failed', {
      '.betterer.js': `
const { bigger } = require('@betterer/constraints');

module.exports = {
  'throws error': {
    test: () => {
      throw new Error('OH NO!');
    },
    constraint: bigger
  }
};
`
    });

    const configPaths = [paths.config];
    const resultsPath = paths.results;

    const firstRun = await betterer({ configPaths, resultsPath });

    expect(firstRun.failed).toEqual(['throws error']);

    expect(logs).toMatchSnapshot();

    const result = await readFile(resultsPath);

    expect(result).toMatchSnapshot();

    await cleanup();
  });

  it('should print the results out when writing the file fails', async () => {
    const { logs, paths, cleanup } = await createFixture('test-betterer-failed-writing', {
      '.betterer.js': `
const { smaller, bigger } = require('@betterer/constraints');

let grows = 0;

module.exports = {
  'should shrink': {
    test: () => grows++,
    constraint: smaller
  }
};
      `
    });

    const configPaths = [paths.config];
    const resultsPath = paths.results;

    jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error());

    await betterer({ configPaths, resultsPath });

    expect(logs).toMatchSnapshot();

    await cleanup();
  });

  it('should throws when reading the results file fails', async () => {
    const { logs, paths, cleanup, resolve, writeFile } = await createFixture('test-betterer-failed-reading', {
      '.betterer.js': `
const { smaller, bigger } = require('@betterer/constraints');

let grows = 0;

module.exports = {
  'should shrink': {
    test: () => grows++,
    constraint: smaller
  }
};
      `
    });

    const configPaths = [paths.config];
    const resultsPath = paths.results;
    const indexPath = resolve('./src/index.ts');

    await writeFile(resultsPath, 'throw new Error()');

    await expect(async () => await betterer({ configPaths, resultsPath })).rejects.toThrow();
    await expect(async () => await betterer.single({ configPaths, resultsPath }, indexPath)).rejects.toThrow();

    expect(logs).toMatchSnapshot();

    await cleanup();
  });
});
