import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, lstatSync, unlinkSync } from 'node:fs';
import type { Logger } from '../types.ts';

/**
 * Check if the server is running in production mode
 *
 * Reads the NODE_ENV environment variable. Returns true only when
 * NODE_ENV is explicitly set to "production".
 *
 * @returns True if NODE_ENV === "production"
 */
export function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * True when path exists and is a symbolic link (does not follow the link).
 *
 * @param filePath - Absolute path to check
 * @returns Whether the path is a symlink
 */
export function isEnvSymlink(filePath: string): boolean {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * True when path exists as a regular file (not a symlink).
 *
 * @param filePath - Absolute path to check
 * @returns Whether a regular file is present
 */
function isRegularFile(filePath: string): boolean {
  try {
    const st = lstatSync(filePath);
    return st.isFile() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Parse a .env file into a key/value map (does not touch process.env).
 *
 * Skips blank lines, comments, and lines with an empty key. A line with a key
 * but no value (e.g. `STRIPE_KEY=`) yields an empty string — operators can
 * explicitly clear a value when the key is not already set in the process.
 * Handles quoted values and values containing '='. **Refuses symlinks.**
 *
 * @param filePath - Absolute path to the .env file
 * @param logger - Optional logger for refusal warnings
 * @returns Parsed map, or null if missing/unreadable/refused
 */
export function parseEnvFile(
  filePath: string,
  logger?: Partial<Logger>
): Record<string, string> | null {
  if (isEnvSymlink(filePath)) {
    logger?.error?.('Refusing to load .env symlink (secret-leak risk). Use a regular file.', {
      filePath,
    });
    return null;
  }
  try {
    const data = readFileSync(filePath, 'utf8');
    const parsed: Record<string, string> = {};
    for (const line of data.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const [rawKey, ...valueParts] = line.split('=');
      const key = rawKey.trim();
      if (key) {
        parsed[key] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
    return parsed;
  } catch {
    // File doesn't exist or unreadable — silent
    return null;
  }
}

/**
 * Apply key=value pairs from a .env file onto process.env.
 *
 * Same parsing rules as {@link parseEnvFile}. **Does not override** keys that
 * are already set on `process.env` (including empty string) — matches dotenv
 * and keeps shell/CI/test defaults from being clobbered by a blank local
 * `KEY=` line (e.g. empty `STRIPE_ENDPOINT_SECRET=` 503-ing webhook tests).
 *
 * @param filePath - Absolute path to the .env file
 * @param logger - Optional logger for refusal warnings
 * @returns True if a regular file was loaded, false if skipped/missing
 */
export function loadEnvFile(filePath: string, logger?: Partial<Logger>): boolean {
  const parsed = parseEnvFile(filePath, logger);
  if (!parsed) return false;
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

/**
 * Ensure backend/.env is a regular file, never a symlink outside the project.
 *
 * Removes a symlink if present, then creates from .env.example when missing.
 *
 * @param envFilePath - Absolute path to .env
 * @param envExamplePath - Absolute path to .env.example
 * @param logger - Optional logger
 * @returns True if a regular .env is ready to load
 */
function ensureRegularEnvFile(
  envFilePath: string,
  envExamplePath: string,
  logger?: Partial<Logger>
): boolean {
  if (isEnvSymlink(envFilePath)) {
    logger?.error?.('backend/.env is a symlink — removing (secret-leak risk)', { filePath: envFilePath });
    try {
      unlinkSync(envFilePath);
    } catch (err) {
      logger?.error?.('Failed to remove .env symlink', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  if (isRegularFile(envFilePath)) return true;

  try {
    const exampleData = readFileSync(envExamplePath, 'utf8');
    writeFileSync(envFilePath, exampleData);
    return true;
  } catch (exampleErr) {
    logger?.error?.('Failed to create .env from template', {
      error: exampleErr instanceof Error ? exampleErr.message : String(exampleErr),
    });
    return false;
  }
}

/**
 * Load environment variables from .env and optional .env.local file.
 *
 * Merges backend/.env then backend/.env.local (local wins on conflict within
 * the files), then applies only keys **not already set** on `process.env`
 * (shell / CI / tests win). Creates a **regular** .env from .env.example if
 * missing. Symlinked env files are refused and removed when possible. Only
 * called in non-production mode — Railway injects vars directly in prod.
 *
 * @param options - Load options
 * @param options.baseDir - Backend directory (defaults to parent of this module)
 * @param options.logger - Logger for failure reporting
 */
export function loadLocalENV(options: { baseDir?: string; logger?: Partial<Logger> } = {}): void {
  const baseDir = options.baseDir ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const logger = options.logger;
  const envFilePath = resolve(baseDir, './.env');
  const envLocalPath = resolve(baseDir, './.env.local');
  const envExamplePath = resolve(baseDir, './.env.example');

  /** File-layer merge: .env then .env.local (local wins). */
  const fromFiles: Record<string, string> = {};

  if (ensureRegularEnvFile(envFilePath, envExamplePath, logger)) {
    Object.assign(fromFiles, parseEnvFile(envFilePath, logger) ?? {});
  }

  // .env.local is optional; still refuse symlinks
  Object.assign(fromFiles, parseEnvFile(envLocalPath, logger) ?? {});

  for (const [key, value] of Object.entries(fromFiles)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Resolve environment variable placeholders in configuration strings
 *
 * Replaces ${VAR_NAME} patterns with process.env values. Logs warning
 * and preserves placeholder if environment variable is undefined. Returns
 * non-string input unchanged.
 *
 * @param str - String with ${VAR_NAME} placeholders
 * @param logger - Optional logger with warn() method
 * @returns String with placeholders replaced
 */
export function resolveEnvironmentVariables(str: string, logger?: Partial<Logger>): string {
  if (typeof str !== 'string') return str;

  return str.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      logger?.warn?.('Environment variable not defined, using placeholder', { varName, placeholder: match });
      return match; // Return the placeholder if env var is not found
    }
    return envValue;
  });
}

/**
 * Validate required environment variables are set
 *
 * Checks for STRIPE_KEY, STRIPE_ENDPOINT_SECRET, JWT_SECRET, and any
 * unresolved ${VAR} references in database config. Logs warnings for
 * missing variables but does not exit the process.
 *
 * @param options - Validation context
 * @returns True if all required variables are present
 */
export function validateEnvironmentVariables({
  config,
  stripeKey,
  stripeEndpointSecret,
  jwtSecret,
  logger,
  env = process.env
}: {
  config: { database: { connectionString: unknown } };
  stripeKey?: string;
  stripeEndpointSecret?: string;
  jwtSecret?: string;
  logger?: Partial<Logger>;
  env?: Record<string, string | undefined>;
}): boolean {
  const missing: string[] = [];

  if (!stripeKey) missing.push('STRIPE_KEY');
  if (!stripeEndpointSecret) missing.push('STRIPE_ENDPOINT_SECRET');
  if (!jwtSecret) missing.push('JWT_SECRET');

  // Check for database environment variables that are referenced but not defined
  if (typeof config.database.connectionString === 'string') {
    const matches = config.database.connectionString.match(/\$\{([^}]+)\}/g);
    if (matches) {
      matches.forEach(match => {
        const varName = match.slice(2, -1); // Remove ${ and }
        if (!env[varName]) {
          missing.push(`${varName} (referenced in database config)`);
        }
      });
    }
  }

  if (missing.length > 0) {
    logger?.warn?.('Missing environment variables - server continuing with limited functionality', {
      missing,
      hint: 'Set DATABASE_URL, MONGODB_URL, POSTGRES_URL, STRIPE_KEY, JWT_SECRET for full functionality'
    });

    // Don't exit - let the server continue with warnings
    return false;
  }

  return true;
}
