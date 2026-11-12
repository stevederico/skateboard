import { createBannedImportRule, packages } from '../lib/bannedImports.js';

/** HTTP client packages that duplicate the platform `fetch`. */
const HTTP_CLIENTS = [
  'axios',
  'got',
  'node-fetch',
  'ky',
  'superagent',
  'request',
  'request-promise',
  'request-promise-native',
  'cross-fetch',
  'isomorphic-fetch',
  'whatwg-fetch',
  'needle',
  'phin',
  'ofetch',
];

export default createBannedImportRule({
  description: 'Never use axios, got, or similar: native `fetch` only.',
  source: 'AGENTS.md > Prohibited Tools & Practices',
  entries: [
    {
      match: packages(HTTP_CLIENTS),
      why:
        'browsers and Node 24 ship `fetch`; a client library adds bundle weight and supply-chain risk, and in app code it bypasses skateboard-ui\'s request layer (credentials, CSRF token, 401 -> /signout redirect, 30 s timeout).',
      fix:
        'in src/ use `apiRequest` / `apiRequestWithParams` (mutations, event handlers) or `useListData` (reads) from "@stevederico/skateboard-ui/Utilities"; in Node scripts use global `fetch` with an AbortSignal timeout and the backoff rules in AGENTS.md > External API Safety.',
    },
  ],
});
