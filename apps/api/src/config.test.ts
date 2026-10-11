import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configPath,
  defaultFileConfig,
  loadFileConfig,
  readConfig,
  saveFileConfig,
  type FileConfig,
} from './config.js';

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ots-config-'));
  path = join(dir, 'nested', 'config.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// A stand-in for the per-user folder, so nothing here depends on the machine.
const HOME = { LOCALAPPDATA: resolve('/synthetic/appdata'), HOME: resolve('/synthetic/home') };
const FILE: FileConfig = {
  data_dir: resolve('/synthetic/from-file'),
  port: 4100,
  lan_guard: false,
  log_level: 'debug',
};

describe('where the config file is', () => {
  it('is OTS_CONFIG when set', () => {
    expect(configPath({ OTS_CONFIG: join(dir, 'c.json') })).toBe(join(dir, 'c.json'));
  });

  it('defaults to the per-user folder', () => {
    const found = configPath(HOME);
    expect(found.endsWith(join('ontheshoulder', 'config.json'))).toBe(true);
    if (process.platform === 'win32') {
      expect(found).toBe(join(HOME.LOCALAPPDATA, 'ontheshoulder', 'config.json'));
    } else {
      expect(found).toContain(join('.config', 'ontheshoulder'));
    }
  });
});

describe('first start with no config file', () => {
  it('writes the file with defaults and reports that it did', () => {
    expect(existsSync(path)).toBe(false);
    const first = loadFileConfig(path, HOME);
    expect(first.created).toBe(true);
    expect(first.config).toEqual(defaultFileConfig(HOME));
    expect(first.config).toMatchObject({ port: 3001, lan_guard: true, log_level: 'info' });
    expect(first.config.data_dir.endsWith('ontheshoulder')).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(first.config);

    const second = loadFileConfig(path, HOME);
    expect(second.created).toBe(false);
    expect(second.config).toEqual(first.config);
  });

  it('writes the default data folder even when OTS_DATA_DIR is set for this run', () => {
    const { config } = loadFileConfig(path, { ...HOME, OTS_DATA_DIR: join(dir, 'override') });
    expect(config.data_dir).toBe(defaultFileConfig(HOME).data_dir);
  });
});

describe('precedence: environment over file over defaults', () => {
  it('uses defaults with neither', () => {
    const config = readConfig(HOME);
    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 3001,
      lanGuard: true,
      logLevel: 'info',
      logDir: null,
      overrides: [],
    });
    expect(config.dataDir).toBe(defaultFileConfig(HOME).data_dir);
  });

  it('uses the file over the defaults', () => {
    expect(readConfig(HOME, FILE)).toMatchObject({
      dataDir: FILE.data_dir,
      port: 4100,
      lanGuard: false,
      logLevel: 'debug',
      overrides: [],
    });
  });

  it('uses the environment over the file, and says which settings it overrode', () => {
    const env = {
      ...HOME,
      OTS_DATA_DIR: join(dir, 'from-env'),
      OTS_PORT: '4200',
      OTS_LAN_GUARD: 'true',
      OTS_LOG_LEVEL: 'warn',
    };
    expect(readConfig(env, FILE)).toMatchObject({
      dataDir: join(dir, 'from-env'),
      port: 4200,
      lanGuard: true,
      logLevel: 'warn',
      overrides: ['data_dir', 'port', 'lan_guard', 'log_level'],
    });
  });

  it('overrides one setting at a time, leaving the rest to the file', () => {
    const config = readConfig({ ...HOME, OTS_PORT: '4300' }, FILE);
    expect(config).toMatchObject({
      dataDir: FILE.data_dir,
      port: 4300,
      lanGuard: false,
      logLevel: 'debug',
      overrides: ['port'],
    });
  });

  it('treats an empty environment variable as not set', () => {
    expect(readConfig({ ...HOME, OTS_PORT: '', OTS_DATA_DIR: '' }, FILE)).toMatchObject({
      port: 4100,
      dataDir: FILE.data_dir,
      overrides: [],
    });
  });

  it('still refuses an environment value it cannot use', () => {
    expect(() => readConfig({ OTS_PORT: 'eighty' }, FILE)).toThrow(/OTS_PORT/);
    expect(() => readConfig({ OTS_LAN_GUARD: 'off' }, FILE)).toThrow(/OTS_LAN_GUARD/);
  });
});

describe('a config file that cannot be used stops the start', () => {
  const write = (content: string) => {
    saveFileConfig(path, defaultFileConfig(HOME));
    writeFileSync(path, content, 'utf8');
  };

  it('fills in settings the file leaves out', () => {
    write(JSON.stringify({ port: 4400 }));
    expect(loadFileConfig(path, HOME).config).toEqual({
      ...defaultFileConfig(HOME),
      port: 4400,
    });
  });

  it.each([
    ['not JSON', '{ port: ', /is not valid JSON/],
    ['not an object', '[3001]', /\(root\) must be a JSON object/],
    ['an unknown key', '{ "lan_gaurd": false }', /lan_gaurd is not a known setting/],
    ['a port out of range', '{ "port": 70000 }', /port must be an integer/],
    [
      'a guard that is not a boolean',
      '{ "lan_guard": "false" }',
      /lan_guard must be true or false/,
    ],
    ['a relative data folder', '{ "data_dir": "data" }', /data_dir must be an absolute path/],
    ['an unknown log level', '{ "log_level": "loud" }', /log_level must be one of/],
  ])('%s', (_name, content, message) => {
    write(content);
    expect(() => loadFileConfig(path, HOME)).toThrow(message);
    // The error names the file, and the file is left as it was for the user to fix.
    expect(() => loadFileConfig(path, HOME)).toThrow(path);
    expect(readFileSync(path, 'utf8')).toBe(content);
  });
});

describe('saveFileConfig', () => {
  it('writes readable JSON, creates the folder, and leaves no temp file behind', () => {
    saveFileConfig(path, FILE);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(FILE);
    expect(readFileSync(path, 'utf8')).toContain('\n  "port": 4100');
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });
});
