import rule from './input-requires-label.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('input-requires-label', rule, {
  valid: [
    '<Field><Label htmlFor="email">Email</Label><Input id="email" type="email" /></Field>',
    '<Input aria-label="Search projects" />',
    '<Label>Bio<Textarea /></Label>',
    '<Input {...field} />',
    '<Input type="hidden" name="token" />',
    '<CommandInput placeholder="Search pages..." />',
  ],
  invalid: [
    { code: '<Input placeholder="Enter email..." />', errors: [{ messageId: 'unlabeled' }] },
    { code: '<Field><Label>Email</Label><Input placeholder="Enter email..." /></Field>', errors: [{ messageId: 'unlabeled' }] },
    { code: '<Textarea value={bio} onChange={handleBioChange} />', errors: [{ messageId: 'unlabeled' }] },
  ],
});
