import rule from './icon-button-requires-label.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('icon-button-requires-label', rule, {
  valid: [
    '<Button onClick={onButtonClick}><Plus size={18} aria-hidden="true" />{buttonTitle}</Button>',
    '<Button variant="ghost" size="icon" aria-label="Delete item"><Trash2 size={18} /></Button>',
    '<Button size="icon"><X size={18} /><span className="sr-only">Close dialog</span></Button>',
    '<Button><Plus size={18} aria-hidden="true" />Add Item</Button>',
    '<Button asChild><a href="/x"><Plus size={18} /></a></Button>',
    '<Button {...props}><X size={18} /></Button>',
    '<Button size="icon" aria-labelledby="close-label"><X size={18} /></Button>',
  ],
  invalid: [
    { code: '<Button variant="ghost" size="icon"><X size={18} /></Button>', errors: [{ messageId: 'missingLabel' }] },
    { code: '<Button onClick={handleDelete}><Trash2 size={18} /></Button>', errors: [{ messageId: 'missingLabel' }] },
    { code: '<Button size="icon-sm" />', errors: [{ messageId: 'missingLabel' }] },
  ],
});
