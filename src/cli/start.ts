import * as path from 'path';

import { better } from '../better';
import { RESULTS_ENV, CONFIG_ENV } from './env';

export async function start(): Promise<void> {
  const cwd = process.cwd();
  const configPath = path.resolve(cwd, process.env[CONFIG_ENV] as string);
  const resultsPath = path.resolve(cwd, process.env[RESULTS_ENV] as string);
  const { worse } = await better({ configPath, resultsPath });
  process.exit(worse.length !== 0 ? 1 : 0);
}
