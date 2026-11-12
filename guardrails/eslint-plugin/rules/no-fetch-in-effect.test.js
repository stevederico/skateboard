import rule from './no-fetch-in-effect.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-fetch-in-effect', rule, {
  valid: [
    // CommandMenu: an effect that only subscribes to a DOM event.
    `useEffect(() => {
      function handleKeyDown(e) { if (e.key === 'k') setOpen((p) => !p); }
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);`,
    'const { data, loading, error, refetch } = useListData("/deals");',
    `async function handleSave() {
      try { await apiRequest('/deals', { method: 'POST', body: '{}' }); } catch (err) { console.error(err); }
    }`,
    // A function that fetches but is only called from an event handler.
    `const load = async () => fetch('/x');
     useEffect(() => { document.title = 'Deals'; }, []);
     const handleClick = () => load();`,
    'useMemo(() => fetch, []);',
  ],
  invalid: [
    {
      code: "useEffect(() => { fetch('/api/deals').then((r) => r.json()).then(setDeals); }, []);",
      errors: [{ messageId: 'fetchInEffect', data: { call: 'fetch', hook: 'useEffect', via: '' } }],
    },
    {
      code: "React.useEffect(() => { (async () => { setDeals(await apiRequest('/deals')); })(); }, []);",
      errors: [{ messageId: 'fetchInEffect', data: { call: 'apiRequest', hook: 'useEffect', via: '' } }],
    },
    {
      code: "useEffect(() => { async function load() { setUser(await getCurrentUser()); } load(); }, []);",
      errors: [{ messageId: 'fetchInEffect', data: { call: 'getCurrentUser', hook: 'useEffect', via: ' (via `load`)' } }],
    },
    {
      code: "const load = useCallback(async () => setRows(await apiRequestWithParams('/rows', { page: '1' })), []);\nuseEffect(() => { load(); }, [load]);",
      errors: [{ messageId: 'fetchInEffect', data: { call: 'apiRequestWithParams', hook: 'useEffect', via: ' (via `load`)' } }],
    },
    {
      code: "function loadDeals() { return window.fetch('/deals'); }\nuseLayoutEffect(loadDeals, []);",
      errors: [{ messageId: 'fetchInEffect', data: { call: 'fetch', hook: 'useLayoutEffect', via: ' (via `loadDeals`)' } }],
    },
    {
      code: "useEffect(() => { const xhr = new XMLHttpRequest(); xhr.open('GET', '/x'); xhr.send(); }, []);",
      errors: [{ messageId: 'fetchInEffect', data: { call: 'XMLHttpRequest', hook: 'useEffect', via: '' } }],
    },
    {
      code: "useEffect(() => { isSubscriber().then(setIsPro); }, []);",
      errors: [{ messageId: 'fetchInEffect' }],
    },
  ],
});
