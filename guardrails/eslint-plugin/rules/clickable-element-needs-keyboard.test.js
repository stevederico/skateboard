import rule from './clickable-element-needs-keyboard.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('clickable-element-needs-keyboard', rule, {
  valid: [
    '<div role="button" tabIndex={0} onClick={handleOpen} onKeyDown={handleKeyDown} />',
    '<Button onClick={handleOpen}>Open</Button>',
    '<label onClick={handleFocus}>Name</label>',
    '<CommandItem onSelect={() => handleSelect(page.url)} />',
    '<div {...rowProps} onClick={handleOpen} />',
    '<div className="p-4" />',
  ],
  invalid: [
    { code: '<div onClick={handleOpen}>Open</div>', errors: [{ messageId: 'notKeyboardReachable' }] },
    { code: '<span role="button" onClick={handleOpen}>x</span>', errors: [{ messageId: 'notKeyboardReachable', data: { name: 'span', missing: '`tabIndex`, a keyboard handler (`onKeyDown`)' } }] },
    { code: '<li role="option" tabIndex={0} onClick={handlePick} />', errors: [{ messageId: 'notKeyboardReachable' }] },
  ],
});
