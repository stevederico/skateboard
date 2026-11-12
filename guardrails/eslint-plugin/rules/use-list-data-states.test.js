import rule from './use-list-data-states.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('use-list-data-states', rule, {
  valid: [
    'const { data, loading, error, refetch } = useListData("/deals");',
    'const { data: deals, loading, error: loadError } = useListData("/deals");',
    'const { data, ...rest } = useListData("/deals");',
    'const list = useListData("/deals");',
    'const { data } = useOtherHook("/deals");',
  ],
  invalid: [
    { code: 'const { data } = useListData("/deals");', errors: [{ messageId: 'missingStates', data: { missing: '`loading` and `error`' } }] },
    { code: 'const { data, loading } = useListData("/deals");', errors: [{ messageId: 'missingStates', data: { missing: '`error`' } }] },
  ],
});
