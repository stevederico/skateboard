#!/usr/bin/env node
/**
 * Fail if installed @stevederico/skateboard-ui does not match package.json,
 * or if Deno install artifacts are still present.
 */
import { verifyUiVersion } from './verify-ui-version.ts';

const result = verifyUiVersion();

if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}

console.log(result.message);