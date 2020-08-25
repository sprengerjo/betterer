import * as assert from 'assert';

import { BettererConfig } from '../config';
import { COULDNT_READ_CONFIG } from '../errors';
import { BettererReporter } from '../reporters';
import { requireUncached } from '../require';
import { BettererResults, BettererDiff } from '../results';
import {
  BettererTest,
  isBettererTest,
  BettererTestMap,
  BettererTestOptionsMap,
  BettererTestOptions,
  isBettererFileTest
} from '../test';
import { BettererFilePaths } from '../watcher';
import { BettererRunΩ, BettererRunsΩ } from './run';
import { BettererStatsΩ } from './statistics';
import { Resolve, BettererContext } from './types';

enum BettererContextStatus {
  notReady,
  ready,
  running,
  end
}

export class BettererContextΩ implements BettererContext {
  private _results: BettererResults;
  private _stats: BettererStatsΩ | null = null;
  private _tests: BettererTestMap = {};
  private _status = BettererContextStatus.notReady;

  private _running: Promise<void> | null = null;
  private _finish: Resolve | null = null;

  constructor(public readonly config: BettererConfig, private _reporter?: BettererReporter) {
    this._results = new BettererResults(config);
    this._reporter?.contextStart?.(this);
  }

  public async setup(): Promise<void> {
    if (this._status === BettererContextStatus.running) {
      await this._running;
    }
    assert(this._status === BettererContextStatus.notReady || this._status === BettererContextStatus.end);

    this._tests = this._initTests();
    this._initFilters();
    this._status = BettererContextStatus.ready;
  }

  public tearDown(): void {
    assert.equal(this._status, BettererContextStatus.end);
    assert(this._stats);
    this._reporter?.contextEnd?.(this, this._stats);
  }

  public async runnerStart(files: BettererFilePaths = []): Promise<BettererRunsΩ> {
    assert.equal(this._status, BettererContextStatus.ready);
    this._stats = new BettererStatsΩ();
    await this._initObsolete();
    const runs = await Promise.all(
      Object.keys(this._tests)
        .filter((name) => {
          const test = this._tests[name];
          // Only run BettererFileTests when a list of files is given:
          return !files.length || isBettererFileTest(test);
        })
        .map(async (name) => {
          const test = this._tests[name];
          const expected = await this._results.getResult(name, test);
          return new BettererRunΩ(this, name, test, expected, files);
        })
    );
    this._reporter?.runsStart?.(runs, files);
    this._status = BettererContextStatus.running;
    this._running = new Promise((resolve) => {
      this._finish = resolve as Resolve;
    });
    return runs;
  }

  public runnerEnd(runs: BettererRunsΩ, files: BettererFilePaths = []): void {
    assert.equal(this._status, BettererContextStatus.running);
    assert(this._finish);
    this._reporter?.runsEnd?.(runs, files);
    this._status = BettererContextStatus.end;
    this._finish();
  }

  public runStart(run: BettererRunΩ): void {
    assert(this._stats);
    if (run.isExpired) {
      this._stats.expired.push(run.name);
    }
    this._reporter?.runStart?.(run);
  }

  public runBetter(run: BettererRunΩ): void {
    assert(this._stats);
    this._stats.better.push(run.name);
  }

  public runFailed(run: BettererRunΩ): void {
    assert(this._stats);
    this._stats.failed.push(run.name);
  }

  public runNew(run: BettererRunΩ): void {
    assert(this._stats);
    this._stats.new.push(run.name);
  }

  public runRan(run: BettererRunΩ): void {
    assert(this._stats);
    this._stats.ran.push(run.name);
  }

  public runSame(run: BettererRunΩ): void {
    assert(this._stats);
    this._stats.same.push(run.name);
  }

  public runSkipped(run: BettererRunΩ): void {
    assert(this._stats);
    this._stats.skipped.push(run.name);
  }

  public runUpdate(run: BettererRunΩ): BettererDiff {
    assert(this._stats);
    this._stats.updated.push(run.name);
    return this._results.getDiff(run);
  }

  public runWorse(run: BettererRunΩ): BettererDiff {
    assert(this._stats);
    this._stats.worse.push(run.name);
    return this._results.getDiff(run);
  }

  public runEnd(run: BettererRunΩ): void {
    assert(this._stats);
    if (run.isComplete) {
      this._stats.completed.push(run.name);
    }
    this._reporter?.runEnd?.(run);
  }

  public async process(runs: BettererRunsΩ): Promise<BettererStatsΩ> {
    assert.equal(this._status, BettererContextStatus.end);
    assert(this._stats);
    const printed = await this._results.print(runs);
    try {
      await this._results.write(printed);
    } catch (error) {
      this._reporter?.contextError?.(this, error, printed);
    }
    return this._stats;
  }

  private _initTests(): BettererTestMap {
    let tests: BettererTestMap = {};
    this.config.configPaths.map((configPath) => {
      const more = this._getTests(configPath);
      tests = { ...tests, ...more };
    });
    const only = Object.values(tests).find((test) => test.isOnly);
    if (only) {
      Object.values(tests).forEach((test) => {
        if (!test.isOnly) {
          test.skip();
        }
      });
    }
    return tests;
  }

  private _getTests(configPath: string): BettererTestMap {
    try {
      const testOptions = requireUncached<BettererTestOptionsMap>(configPath);
      const tests: BettererTestMap = {};
      Object.keys(testOptions).forEach((name) => {
        const maybeTest = testOptions[name];
        let test: BettererTest | null = null;
        if (isBettererTest(maybeTest)) {
          test = maybeTest;
        } else {
          test = new BettererTest(testOptions[name] as BettererTestOptions);
        }
        assert(test);
        tests[name] = test;
      });
      return tests;
    } catch (e) {
      throw COULDNT_READ_CONFIG(configPath, e);
    }
  }

  private async _initObsolete(): Promise<void> {
    assert(this._stats);
    const resultNames = await this._results.getResultNames();
    const obsolete = resultNames.filter(
      (expectedName) => !Object.keys(this._tests).find((name) => name === expectedName)
    );
    this._stats.obsolete.push(...obsolete);
  }

  private _initFilters(): void {
    const { filters } = this.config;
    if (filters.length) {
      Object.keys(this._tests).forEach((name) => {
        if (!filters.some((filter) => filter.test(name))) {
          this._tests[name].skip();
        }
      });
    }
  }
}
