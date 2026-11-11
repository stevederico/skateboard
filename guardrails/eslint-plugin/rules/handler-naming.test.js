import rule from './handler-naming.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('handler-naming', rule, {
  valid: [
    'function V({ onButtonClick }) { return <Button onClick={onButtonClick}>Go</Button>; }',
    'function V() { const [open, setOpen] = useState(false); return <CommandDialog open={open} onOpenChange={setOpen} />; }',
    'function V() { function handleSave() {} return <Button onClick={handleSave}>Save</Button>; }',
    'function V() { const handleSelect = useCallback(() => {}, []); return <CommandItem onSelect={handleSelect} />; }',
    'function V(props) { return <Button onClick={props.onSave}>Save</Button>; }',
    'import { save } from "./api"; function V() { return <Button onClick={save}>Save</Button>; }',
    'function V() { return <CommandItem onSelect={() => handleSelect(page.url)} />; }',
  ],
  invalid: [
    {
      code: 'function V() { function save() {} return <Button onClick={save}>Save</Button>; }',
      errors: [{ messageId: 'handlerName', data: { prop: 'onClick', name: 'save', suggestion: 'handleSave' } }],
    },
    {
      code: 'function V() { const toggle = () => {}; return <Switch onCheckedChange={toggle} />; }',
      errors: [{ messageId: 'handlerName' }],
    },
    {
      code: 'function V() { const onSubmit = useCallback(() => {}, []); return <form onSubmit={onSubmit} />; }',
      errors: [{ messageId: 'handlerName', data: { prop: 'onSubmit', name: 'onSubmit', suggestion: 'handleSubmit' } }],
    },
  ],
});
