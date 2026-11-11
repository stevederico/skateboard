import rule from './no-third-party-http-clients.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-third-party-http-clients', rule, {
  valid: [
    "import { apiRequest } from '@stevederico/skateboard-ui/Utilities';",
    { code: "const res = await fetch('https://api.example.com', { signal: AbortSignal.timeout(10_000) });", filename: 'scripts/tool.js' },
    "import { kyber } from 'kyber';",
  ],
  invalid: [
    { code: "import axios from 'axios';", errors: [{ messageId: 'banned' }] },
    { code: "import got from 'got';", filename: 'scripts/tool.js', errors: [{ messageId: 'banned' }] },
    { code: "import fetch from 'node-fetch';", filename: 'scripts/tool.js', errors: [{ messageId: 'banned' }] },
    { code: "import ky from 'ky';", errors: [{ messageId: 'banned' }] },
    { code: "const request = require('superagent');", filename: 'scripts/tool.js', errors: [{ messageId: 'banned' }] },
  ],
});
