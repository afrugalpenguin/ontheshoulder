export interface Config {
  host: string;
  port: number;
  logLevel: string;
  /** Refuse requests from outside the LAN. On unless OTS_LAN_GUARD is "false". */
  lanGuard: boolean;
  /** Folder for the rolling log file, or null to use <data dir>/logs. */
  logDir: string | null;
}

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3001;
const DEFAULT_LOG_LEVEL = 'info';

/** Reads api settings from the environment. Throws on a value it cannot use. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.OTS_HOST || DEFAULT_HOST,
    port: readPort(env.OTS_PORT),
    logLevel: env.OTS_LOG_LEVEL || DEFAULT_LOG_LEVEL,
    lanGuard: readFlag('OTS_LAN_GUARD', env.OTS_LAN_GUARD, true),
    logDir: env.OTS_LOG_DIR || null,
  };
}

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
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
