export interface Config {
  host: string;
  port: number;
  logLevel: string;
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
