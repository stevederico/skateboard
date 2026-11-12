import rule from './no-classname-template-ternary.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-classname-template-ternary', rule, {
  valid: [
    '<div className={cn("p-4", isActive && "bg-accent")} />',
    '<div className={`grid ${columns}`} />',
    '<div className="flex flex-col" />',
    'const s = `a ${ok ? "b" : "c"}`;',
  ],
  invalid: [
    { code: '<div className={`p-4 ${isActive ? "bg-accent" : ""}`} />', errors: [{ messageId: 'template' }] },
    { code: '<div className={`p-4 ${isActive && "bg-accent"}`} />', errors: [{ messageId: 'template' }] },
  ],
});
