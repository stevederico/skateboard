import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('../..', import.meta.url));

export const ARTIFACTS = path.join(REPO, 'verify-artifacts');

export const SCREENSHOTS = path.join(ARTIFACTS, 'screenshots');

export const BACKEND_STATE = path.join(ARTIFACTS, 'backend-state');
