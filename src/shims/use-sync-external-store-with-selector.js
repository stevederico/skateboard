import { useSyncExternalStore, useRef, useEffect, useMemo } from 'react';

function is(x, y) {
  return (x === y && (0 !== x || 1 / x === 1 / y)) || (x !== x && y !== y);
}

const objectIs = typeof Object.is === 'function' ? Object.is : is;

export function useSyncExternalStoreWithSelector(
  subscribe,
  getSnapshot,
  getServerSnapshot,
  selector,
  isEqual
) {
  const instRef = useRef(null);
  if (instRef.current === null) {
    instRef.current = { hasValue: false, value: null };
  }
  const inst = instRef.current;

  const [getSelection, getServerSelection] = useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot;
    let memoizedSelection;

    const memoizedSelector = (nextSnapshot) => {
      if (!hasMemo) {
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const nextSelection = selector(nextSnapshot);
        if (isEqual !== undefined && inst.hasValue) {
          const currentSelection = inst.value;
          if (isEqual(currentSelection, nextSelection)) {
            memoizedSelection = currentSelection;
            return currentSelection;
          }
        }
        memoizedSelection = nextSelection;
        return nextSelection;
      }

      if (objectIs(memoizedSnapshot, nextSnapshot)) {
        return memoizedSelection;
      }

      const nextSelection = selector(nextSnapshot);
      if (isEqual !== undefined && isEqual(memoizedSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot;
        return memoizedSelection;
      }

      memoizedSnapshot = nextSnapshot;
      memoizedSelection = nextSelection;
      return nextSelection;
    };

    const maybeGetServerSnapshot = getServerSnapshot === undefined ? null : getServerSnapshot;

    return [
      () => memoizedSelector(getSnapshot()),
      maybeGetServerSnapshot === null ? undefined : () => memoizedSelector(maybeGetServerSnapshot())
    ];
  }, [getSnapshot, getServerSnapshot, selector, isEqual]);

  const value = useSyncExternalStore(subscribe, getSelection, getServerSelection);

  useEffect(() => {
    inst.hasValue = true;
    inst.value = value;
  }, [value]);

  return value;
}
