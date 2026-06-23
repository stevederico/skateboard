import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
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
 * Parse a .env file and apply key=value pairs to process.env.
 *
 * Skips blank lines, comments, and lines with an empty key. A line with a key
 * but no value (e.g. `STRIPE_KEY=`) sets the variable to an empty string —
 * this lets an operator explicitly clear/disable a value. Handles quoted
 * values and values containing '='. Silently skips if file doesn't exist.
 *
 * @param filePath - Absolute path to the .env file
 */
export function loadEnvFile(filePath: string): void {
  try {
    const data = readFileSync(filePath, 'utf8');
    for (const line of data.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const [rawKey, ...valueParts] = line.split('=');
      const key = rawKey.trim();
      if (key) {
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    }
  } catch {
    // File doesn't exist or unreadable — silent
  }
}

/**
 * Load environment variables from .env and optional .env.local file.
 *
 * Reads in two passes: backend/.env first (may be symlink to shared creds),
 * then backend/.env.local for project-specific overrides (wins on conflict).
 * Creates .env from .env.example if it doesn't exist. Only called in
 * non-production mode — Railway injects vars directly in prod.
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

  // Check if .env exists, if not create it from .env.example
  try {
    statSync(envFilePath);
  } catch {
    try {
      const exampleData = readFileSync(envExamplePath, 'utf8');
      writeFileSync(envFilePath, exampleData);
    } catch (exampleErr) {
      logger?.error?.('Failed to create .env from template', { error: exampleErr instanceof Error ? exampleErr.message : String(exampleErr) });
      return;
    }
  }

  // Load .env (may be symlink to shared creds)
  loadEnvFile(envFilePath);

  // Load .env.local overrides (project-specific, optional)
  loadEnvFile(envLocalPath);
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
