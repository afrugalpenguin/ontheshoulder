import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { resolveDataDir } from './db/client.js';

/**
 * Settings, in order of precedence: an environment variable, then the config
 * file, then the default. The config file is what the app itself edits (the
 * data folder in Settings); environment variables are for dev and tests.
 */

/** What the config file holds. */
export interface FileConfig {
  data_dir: string;
  port: number;
  lan_guard: boolean;
  log_level: string;
}

export interface Config {
  host: string;
  port: number;
  logLevel: string;
  /** Refuse requests from outside the LAN. On unless set to false. */
  lanGuard: boolean;
  /** Folder for the rolling log file, or null to use <data dir>/logs. */
  logDir: string | null;
  dataDir: string;
  /** Settings an environment variable is overriding, by config file key. */
  overrides: (keyof FileConfig)[];
}

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3001;
const DEFAULT_LOG_LEVEL = 'info';
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
const KEYS: (keyof FileConfig)[] = ['data_dir', 'port', 'lan_guard', 'log_level'];

/** Where the config file is: OTS_CONFIG, else the per-user config folder. */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OTS_CONFIG) return resolve(env.OTS_CONFIG);
  if (process.platform === 'win32') {
    const base = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return join(base, 'ontheshoulder', 'config.json');
  }
  return join(homedir(), '.config', 'ontheshoulder', 'config.json');
}

/** What a new config file is written with. The data folder is the per-user default. */
export function defaultFileConfig(env: NodeJS.ProcessEnv = process.env): FileConfig {
  return {
    // The default folder, whatever OTS_DATA_DIR says: the file records defaults, not overrides.
    data_dir: resolveDataDir({ ...env, OTS_DATA_DIR: undefined }),
    port: DEFAULT_PORT,
    lan_guard: true,
    log_level: DEFAULT_LOG_LEVEL,
  };
}

function isPort(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65535;
}

/**
 * Checks what was read from a config file and fills gaps with defaults. Throws
 * on anything it cannot use, naming the key: a setting that is misspelt or of
 * the wrong type must stop the start, not be skipped.
 */
export function parseFileConfig(raw: unknown, defaults: FileConfig, path: string): FileConfig {
  const fail = (key: string, why: string): never => {
    throw new Error(`config file ${path}: ${key} ${why}`);
  };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('(root)', 'must be a JSON object');
  }
  const given = raw as Record<string, unknown>;
  const unknown = Object.keys(given).find((k) => !(KEYS as string[]).includes(k));
  if (unknown) fail(unknown, 'is not a known setting');

  const config = { ...defaults };
  if (given.data_dir !== undefined) {
    if (typeof given.data_dir !== 'string' || !isAbsolute(given.data_dir)) {
      fail('data_dir', 'must be an absolute path');
    }
    config.data_dir = given.data_dir as string;
  }
  if (given.port !== undefined) {
    if (!isPort(given.port)) fail('port', 'must be an integer from 1 to 65535');
    config.port = given.port as number;
  }
  if (given.lan_guard !== undefined) {
    if (typeof given.lan_guard !== 'boolean') fail('lan_guard', 'must be true or false');
    config.lan_guard = given.lan_guard as boolean;
  }
  if (given.log_level !== undefined) {
    if (!LOG_LEVELS.includes(given.log_level as string)) {
      fail('log_level', `must be one of ${LOG_LEVELS.join(', ')}`);
    }
    config.log_level = given.log_level as string;
  }
  return config;
}

/** Writes the config file whole, by way of a temp file, so a crash cannot leave half of one. */
export function saveFileConfig(path: string, config: FileConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
}

/**
 * Reads the config file, writing it with defaults first if it is not there.
 * `created` says whether this call wrote it.
 */
export function loadFileConfig(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): { config: FileConfig; created: boolean } {
  const defaults = defaultFileConfig(env);
  if (!existsSync(path)) {
    saveFileConfig(path, defaults);
    return { config: defaults, created: true };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`config file ${path}: is not valid JSON (${(err as Error).message})`, {
      cause: err,
    });
  }
  return { config: parseFileConfig(raw, defaults, path), created: false };
}

/**
 * The settings in force: environment over file over defaults. Pass the file's
 * contents as `file`; without it only the environment and defaults are used.
 * Throws on an environment value it cannot use.
 */
export function readConfig(
  env: NodeJS.ProcessEnv = process.env,
  file: FileConfig | null = null,
): Config {
  const overrides: (keyof FileConfig)[] = [];
  const set = (name: string, key: keyof FileConfig): boolean => {
    const present = env[name] !== undefined && env[name] !== '';
    if (present) overrides.push(key);
    return present;
  };
  const dataDir = set('OTS_DATA_DIR', 'data_dir')
    ? resolve(env.OTS_DATA_DIR as string)
    : (file?.data_dir ?? resolveDataDir(env));
  const port = set('OTS_PORT', 'port') ? readPort(env.OTS_PORT) : (file?.port ?? DEFAULT_PORT);
  const lanGuard = set('OTS_LAN_GUARD', 'lan_guard')
    ? readFlag('OTS_LAN_GUARD', env.OTS_LAN_GUARD, true)
    : (file?.lan_guard ?? true);
  const logLevel = set('OTS_LOG_LEVEL', 'log_level')
    ? (env.OTS_LOG_LEVEL as string)
    : (file?.log_level ?? DEFAULT_LOG_LEVEL);
  return {
    host: env.OTS_HOST || DEFAULT_HOST,
    port,
    logLevel,
    lanGuard,
    logDir: env.OTS_LOG_DIR || null,
    dataDir,
    overrides,
  };
}

/**
 * The data folder in force for a command-line tool: the same answer the api
 * would reach, so `db:migrate` and `db:vacuum` follow a folder moved in Settings.
 */
export function currentDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return readConfig(env, loadFileConfig(configPath(env), env).config).dataDir;
}

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!isPort(port)) {
    throw new Error(`OTS_PORT must be an integer from 1 to 65535, got "${raw}"`);
  }
  return port;
}

function readFlag(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // A guard that is misspelt must not silently turn off.
  throw new Error(`${name} must be "true" or "false", got "${raw}"`);
}
