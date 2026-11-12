import rule from './no-class-components.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-class-components', rule, {
  valid: [
    'export default function HomeView() { return <div />; }',
    'class Store extends Map {}',
    'class ApiError extends Error {}',
  ],
  invalid: [
    { code: 'class A extends Component { render() { return null; } }', errors: [{ messageId: 'classComponent' }] },
    { code: 'class A extends React.Component {}', errors: [{ messageId: 'classComponent' }] },
    { code: 'const A = class extends PureComponent {};', errors: [{ messageId: 'classComponent' }] },
    { code: 'export default class A extends React.PureComponent {}', errors: [{ messageId: 'classComponent' }] },
  ],
});
