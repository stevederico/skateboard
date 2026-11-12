import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root (two levels above guardrails/verify/). */
export const REPO = fileURLToPath(new URL('../..', import.meta.url));

/** Gitignored output root: screenshots/, backend-state/, playwright/ (traces). */
export const ARTIFACTS = path.join(REPO, 'verify-artifacts');

/** Full-page screenshots, one per flow step; uploaded by .github/workflows/verify.yml. */
export const SCREENSHOTS = path.join(ARTIFACTS, 'screenshots');

/** Throwaway backend directory (config.json + SQLite file) used via SKATEBOARD_BACKEND_DIR. */
export const BACKEND_STATE = path.join(ARTIFACTS, 'backend-state');
