/**
 * Minimal React DOM test helpers (no @testing-library/*).
 * Covers only the render/query/event surface used by this repo's tests.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// React 19 act() checks this flag; jsdom/vitest do not set it by default.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** @type {{ root: import('react-dom/client').Root, container: HTMLElement }[]} */
const mounted = [];

/**
 * Escape a string for use inside a CSS attribute selector.
 * @param {string} value
 * @returns {string}
 */
function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Normalize whitespace like Testing Library text matching.
 * @param {string} value
 * @returns {string}
 */
function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} text
 * @param {string | RegExp} matcher
 * @returns {boolean}
 */
function matchesText(text, matcher) {
  const normalized = normalize(text);
  if (typeof matcher === 'string') return normalized === matcher;
  return matcher.test(normalized);
}

/**
 * @param {ParentNode} root
 * @returns {Element[]}
 */
function allElements(root) {
  return Array.from(root.querySelectorAll('*'));
}

/**
 * Deepest elements whose textContent matches (prefer leaves over parents).
 * @param {ParentNode} root
 * @param {string | RegExp} matcher
 * @returns {Element[]}
 */
function findByText(root, matcher) {
  const candidates = allElements(root).filter((el) => matchesText(el.textContent ?? '', matcher));
  return candidates.filter((el) => !candidates.some((other) => other !== el && el.contains(other)));
}

/**
 * Accessible name for simple controls (label text / aria-label / textContent).
 * @param {Element} el
 * @returns {string}
 */
function accessibleName(el) {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    return normalize(parts);
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return normalize(ariaLabel);
  return normalize(el.textContent ?? '');
}

/**
 * @param {string | RegExp} name
 * @param {string} actual
 * @returns {boolean}
 */
function matchesName(name, actual) {
  if (typeof name === 'string') return actual === name;
  return name.test(actual);
}

/**
 * Implicit ARIA role for common HTML elements used in these tests.
 * @param {Element} el
 * @returns {string | null}
 */
function implicitRole(el) {
  const tag = el.tagName;
  if (tag === 'BUTTON') return 'button';
  if (tag === 'A' && el.hasAttribute('href')) return 'link';
  if (tag === 'INPUT') {
    const type = /** @type {HTMLInputElement} */ (el).type || 'text';
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
    return 'textbox';
  }
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') return 'heading';
  if (tag === 'IMG') return 'img';
  if (tag === 'DIV' || tag === 'SPAN') return 'generic';
  return null;
}

/**
 * @param {Element} el
 * @param {string} role
 * @returns {boolean}
 */
function hasRole(el, role) {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit === role;
  return implicitRole(el) === role;
}

/**
 * @param {ParentNode} root
 * @param {string} role
 * @param {{ name?: string | RegExp, busy?: boolean }} [options]
 * @returns {Element[]}
 */
function findByRole(root, role, options = {}) {
  return allElements(root).filter((el) => {
    if (!hasRole(el, role)) return false;
    if (options.busy === true && el.getAttribute('aria-busy') !== 'true') return false;
    if (options.busy === false && el.getAttribute('aria-busy') === 'true') return false;
    if (options.name !== undefined && !matchesName(options.name, accessibleName(el))) return false;
    return true;
  });
}

/**
 * @param {string} kind
 * @param {unknown} matcher
 * @returns {never}
 */
function notFound(kind, matcher) {
  throw new Error(`Unable to find ${kind}: ${String(matcher)}`);
}

/**
 * @param {string} kind
 * @param {unknown} matcher
 * @param {number} count
 * @returns {never}
 */
function tooMany(kind, matcher, count) {
  throw new Error(`Found multiple (${count}) elements for ${kind}: ${String(matcher)}`);
}

/**
 * @template {Element} T
 * @param {T[]} list
 * @param {string} kind
 * @param {unknown} matcher
 * @returns {T}
 */
function one(list, kind, matcher) {
  if (list.length === 0) notFound(kind, matcher);
  if (list.length > 1) tooMany(kind, matcher, list.length);
  return list[0];
}

/**
 * Build get/query helpers scoped to a root node.
 * @param {() => ParentNode} getRoot
 */
function createQueries(getRoot) {
  return {
    getByTestId(id) {
      const list = Array.from(getRoot().querySelectorAll(`[data-testid="${cssEscape(id)}"]`));
      return one(list, 'testid', id);
    },
    queryByTestId(id) {
      return getRoot().querySelector(`[data-testid="${cssEscape(id)}"]`);
    },
    getAllByTestId(id) {
      const list = Array.from(getRoot().querySelectorAll(`[data-testid="${cssEscape(id)}"]`));
      if (list.length === 0) notFound('testid', id);
      return list;
    },
    getByText(matcher) {
      return one(findByText(getRoot(), matcher), 'text', matcher);
    },
    queryByText(matcher) {
      const list = findByText(getRoot(), matcher);
      return list[0] ?? null;
    },
    getByRole(role, options) {
      return one(findByRole(getRoot(), role, options), 'role', role);
    },
    queryByRole(role, options) {
      return findByRole(getRoot(), role, options)[0] ?? null;
    },
  };
}

/** Queries against document.body (last render). */
export const screen = createQueries(() => document.body);

/**
 * Render a React tree into a fresh container on document.body.
 * @param {import('react').ReactNode} ui
 * @returns {{ container: HTMLElement, unmount: () => void }}
 */
export function render(ui) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  const entry = { root, container };
  mounted.push(entry);

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
      const idx = mounted.indexOf(entry);
      if (idx >= 0) mounted.splice(idx, 1);
    },
  };
}

/** Unmount every tree created by {@link render}. */
export function cleanup() {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (!entry) break;
    act(() => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
}

/**
 * @param {EventTarget} target
 * @param {string} type
 * @param {EventInit & Record<string, unknown>} [init]
 */
function dispatch(target, type, init = {}) {
  act(() => {
    let event;
    if (type.startsWith('key')) {
      event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
    } else if (type === 'click') {
      event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    } else {
      event = new Event(type, { bubbles: true, cancelable: true, ...init });
    }
    target.dispatchEvent(event);
  });
}

/**
 * Fire a few DOM events React handlers care about.
 * Mirrors the subset of Testing Library fireEvent used in this repo.
 */
export const fireEvent = {
  /**
   * @param {Element} el
   */
  click(el) {
    dispatch(el, 'click');
  },
  /**
   * @param {HTMLInputElement | HTMLTextAreaElement} el
   * @param {{ target: { value: string } }} init
   */
  change(el, init) {
    const value = init.target.value;
    act(() => {
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      descriptor?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  },
  /**
   * @param {EventTarget} el
   * @param {KeyboardEventInit} init
   */
  keyDown(el, init) {
    dispatch(el, 'keydown', init);
  },
};

/**
 * Yield one macrotask so promise-driven React updates can flush
 * (matches Testing Library asyncWrapper drain after waitFor).
 * @returns {Promise<void>}
 */
function flushMacrotask() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Poll until assertion callback stops throwing.
 * On success, drains one macrotask so in-flight promise state updates paint
 * before the caller continues (RTL asyncWrapper behavior).
 * @param {() => void | Promise<void>} assertion
 * @param {{ timeout?: number, interval?: number }} [options]
 */
export async function waitFor(assertion, options = {}) {
  const timeout = options.timeout ?? 1000;
  const interval = options.interval ?? 50;
  const start = Date.now();
  let lastError = /** @type {unknown} */ (new Error('waitFor timed out'));
  // Match RTL: disable act env while waiting so async updates aren't blocked.
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;

  try {
    while (Date.now() - start < timeout) {
      try {
        await assertion();
        await flushMacrotask();
        return;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw lastError;
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
}

export { act };
