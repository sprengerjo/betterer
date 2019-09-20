import * as ts from 'typescript';

import { Betterer } from '../better/types';
import { smaller } from '../constraints';
import { error, info } from '../logger';

const readFile = ts.sys.readFile.bind(ts.sys);
const readDirectory = ts.sys.readDirectory.bind(ts.sys);

export function tscBetterer(
  configFilePath: string,
  extraCompilerOptions?: ts.CompilerOptions
): Betterer {
  return {
    test: (): number => createTscTest(configFilePath, extraCompilerOptions),
    constraint: smaller,
    goal: 0
  };
}

function createTscTest(
  configFilePath: string,
  extraCompilerOptions?: ts.CompilerOptions
): number {
  info(`running TypeScript compiler...`);

  if (!configFilePath) {
    error();
    throw new Error();
  }

  const { config } = ts.readConfigFile(configFilePath, readFile);
  const { compilerOptions } = config;
  const baseUrl = compilerOptions.baseUrl || '.';

  const host = ts.createCompilerHost({
    ...compilerOptions,
    ...extraCompilerOptions
  });
  const parsed = ts.parseJsonConfigFileContent(
    config,
    {
      ...host,
      readDirectory,
      useCaseSensitiveFileNames: host.useCaseSensitiveFileNames()
    },
    baseUrl
  );

  const program = ts.createProgram({
    ...parsed,
    rootNames: parsed.fileNames,
    host
  });

  const { diagnostics } = program.emit();

  const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(diagnostics);
  if (allDiagnostics.length) {
    error('TypeScript compiler found some issues:');
    console.log(ts.formatDiagnosticsWithColorAndContext(allDiagnostics, host));
  }
  return allDiagnostics.length;
}
