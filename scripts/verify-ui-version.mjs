#!/usr/bin/env node
import { verifyUiVersion } from './verify-ui-version.ts';

const result = verifyUiVersion();

if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}

console.log(result.message);