import rule from './img-requires-alt.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('img-requires-alt', rule, {
  valid: [
    '<img src="/icons/icon.svg" alt="Skateboard logo" />',
    '<img src="/bg.png" alt="" />',
    '<img {...imageProps} />',
    '<Image src="/x.png" />',
  ],
  invalid: [
    { code: '<img src="/icons/icon.svg" />', errors: [{ messageId: 'missingAlt' }] },
    { code: '<img src={user.avatar} className="size-8" />', errors: [{ messageId: 'missingAlt' }] },
  ],
});
