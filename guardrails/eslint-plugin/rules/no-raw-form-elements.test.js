import rule from './no-raw-form-elements.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-raw-form-elements', rule, {
  valid: [
    '<Button onClick={onButtonClick}><Plus size={18} aria-hidden="true" />{buttonTitle}</Button>',
    '<Input id="email" type="email" />',
    '<input type="hidden" name="csrf" value={token} />',
    '<a href="/terms">Terms</a>',
    '<a href="#main" onClick={handleSkip}>Skip</a>',
  ],
  invalid: [
    { code: '<button onClick={handleSave}>Save</button>', errors: [{ messageId: 'raw' }] },
    { code: '<input id="name" />', errors: [{ messageId: 'raw' }] },
    { code: '<input type="checkbox" />', errors: [{ message: /<Checkbox>/ }] },
    { code: '<textarea />', errors: [{ messageId: 'raw' }] },
    { code: '<select><option>a</option></select>', errors: [{ messageId: 'raw' }] },
    { code: '<a onClick={handleOpen}>Open</a>', errors: [{ messageId: 'anchorAction' }] },
  ],
});
