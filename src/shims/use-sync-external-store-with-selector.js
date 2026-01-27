import { useSyncExternalStore } from 'react';

export function useSyncExternalStoreWithSelector(
  subscribe, getSnapshot, getServerSnapshot, selector
) {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    getServerSnapshot ? () => selector(getServerSnapshot()) : undefined
  );
}
