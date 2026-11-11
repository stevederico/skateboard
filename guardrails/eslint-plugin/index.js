/**
 * skateboard guardrails: a zero-dependency ESLint plugin that turns the written
 * "never / don't" rules in AGENTS.md and skills/skateboard/rules/*.md into machine
 * checks. Every message says what was found, why the repo forbids it, and the exact
 * fix, because the usual reader is an agent that will act on it verbatim.
 *
 * The TypeScript parser is re-exported so the root eslint.config.js can use it without
 * any root dependency (the root keeps TypeScript 7, which has no JS API).
 */
import parser from '@typescript-eslint/parser';
import banTsComment from './rules/ban-ts-comment.js';
import clickableElementNeedsKeyboard from './rules/clickable-element-needs-keyboard.js';
import compoundComponentStructure from './rules/compound-component-structure.js';
import filenameConvention from './rules/filename-convention.js';
import handlerNaming from './rules/handler-naming.js';
import headingTextWrap from './rules/heading-text-wrap.js';
import iconButtonRequiresLabel from './rules/icon-button-requires-label.js';
import iconRequiresSize from './rules/icon-requires-size.js';
import iconsThroughFunnel from './rules/icons-through-funnel.js';
import imgRequiresAlt from './rules/img-requires-alt.js';
import importOrder from './rules/import-order.js';
import inputRequiresLabel from './rules/input-requires-label.js';
import layerBoundaries from './rules/layer-boundaries.js';
import motionSafeAnimations from './rules/motion-safe-animations.js';
import noArbitrarySpacingRadius from './rules/no-arbitrary-spacing-radius.js';
import noAriaHiddenOnFocusable from './rules/no-aria-hidden-on-focusable.js';
import noBannedBuildTooling from './rules/no-banned-build-tooling.js';
import noBrowserDialogs from './rules/no-browser-dialogs.js';
import noClassComponents from './rules/no-class-components.js';
import noClassnameTemplateTernary from './rules/no-classname-template-ternary.js';
import noDarkVariant from './rules/no-dark-variant.js';
import noDatabaseDrivers from './rules/no-database-drivers.js';
import noDeepPackageImports from './rules/no-deep-package-imports.js';
import noDirectReactRouter from './rules/no-direct-react-router.js';
import noDotenv from './rules/no-dotenv.js';
import noEmojiIcons from './rules/no-emoji-icons.js';
import noEmptyCatch from './rules/no-empty-catch.js';
import noExplicitAny from './rules/no-explicit-any.js';
import noFetchInEffect from './rules/no-fetch-in-effect.js';
import noFocusedOrSkippedTests from './rules/no-focused-or-skipped-tests.js';
import noForeignTestFrameworks from './rules/no-foreign-test-frameworks.js';
import noGlobalsPackage from './rules/no-globals-package.js';
import noHardcodedConnectionStrings from './rules/no-hardcoded-connection-strings.js';
import noInlineSvg from './rules/no-inline-svg.js';
import noLoadingTextInButton from './rules/no-loading-text-in-button.js';
import noLooseTypes from './rules/no-loose-types.js';
import noNonNullAssertion from './rules/no-non-null-assertion.js';
import noOtherIconLibraries from './rules/no-other-icon-libraries.js';
import noOutlineNoneWithoutFocusRing from './rules/no-outline-none-without-focus-ring.js';
import noPromiseThen from './rules/no-promise-then.js';
import noRawColorClasses from './rules/no-raw-color-classes.js';
import noRawFormElements from './rules/no-raw-form-elements.js';
import noRemovedSkateboardUiImports from './rules/no-removed-skateboard-ui-imports.js';
import noRequire from './rules/no-require.js';
import noSpaceUtilities from './rules/no-space-utilities.js';
import noThirdPartyHttpClients from './rules/no-third-party-http-clients.js';
import noTransitionAll from './rules/no-transition-all.js';
import noTypeAssertion from './rules/no-type-assertion.js';
import preferSizeUtility from './rules/prefer-size-utility.js';
import requireJsdocOnExports from './rules/require-jsdoc-on-exports.js';
import suspenseSkeletonFallback from './rules/suspense-skeleton-fallback.js';
import testFileNaming from './rules/test-file-naming.js';
import useListDataStates from './rules/use-list-data-states.js';

/** Plugin namespace: rules are referenced as `skateboard/<rule>`. */
const NAMESPACE = 'skateboard';

/** Rules that apply to every linted file: TypeScript discipline, imports, errors, tests, docs. */
const BASE_RULES = {
  'ban-ts-comment': banTsComment,
  'no-explicit-any': noExplicitAny,
  'no-type-assertion': noTypeAssertion,
  'no-non-null-assertion': noNonNullAssertion,
  'no-loose-types': noLooseTypes,
  'no-require': noRequire,
  'no-dotenv': noDotenv,
  'no-third-party-http-clients': noThirdPartyHttpClients,
  'no-banned-build-tooling': noBannedBuildTooling,
  'no-globals-package': noGlobalsPackage,
  'no-database-drivers': noDatabaseDrivers,
  'no-foreign-test-frameworks': noForeignTestFrameworks,
  'no-other-icon-libraries': noOtherIconLibraries,
  'no-removed-skateboard-ui-imports': noRemovedSkateboardUiImports,
  'icons-through-funnel': iconsThroughFunnel,
  'no-deep-package-imports': noDeepPackageImports,
  'layer-boundaries': layerBoundaries,
  'no-empty-catch': noEmptyCatch,
  'no-promise-then': noPromiseThen,
  'no-hardcoded-connection-strings': noHardcodedConnectionStrings,
  'no-focused-or-skipped-tests': noFocusedOrSkippedTests,
  'test-file-naming': testFileNaming,
  'import-order': importOrder,
  'require-jsdoc-on-exports': requireJsdocOnExports,
};

/** Rules for browser app code under src/: React, accessibility, styling, data fetching. */
const APP_RULES = {
  'no-direct-react-router': noDirectReactRouter,
  'filename-convention': filenameConvention,
  'no-fetch-in-effect': noFetchInEffect,
  'use-list-data-states': useListDataStates,
  'no-class-components': noClassComponents,
  'no-browser-dialogs': noBrowserDialogs,
  'no-raw-form-elements': noRawFormElements,
  'img-requires-alt': imgRequiresAlt,
  'no-aria-hidden-on-focusable': noAriaHiddenOnFocusable,
  'icon-button-requires-label': iconButtonRequiresLabel,
  'clickable-element-needs-keyboard': clickableElementNeedsKeyboard,
  'input-requires-label': inputRequiresLabel,
  'handler-naming': handlerNaming,
  'suspense-skeleton-fallback': suspenseSkeletonFallback,
  'no-loading-text-in-button': noLoadingTextInButton,
  'compound-component-structure': compoundComponentStructure,
  'no-emoji-icons': noEmojiIcons,
  'no-inline-svg': noInlineSvg,
  'icon-requires-size': iconRequiresSize,
  'heading-text-wrap': headingTextWrap,
  'no-dark-variant': noDarkVariant,
  'no-raw-color-classes': noRawColorClasses,
  'no-outline-none-without-focus-ring': noOutlineNoneWithoutFocusRing,
  'no-space-utilities': noSpaceUtilities,
  'no-transition-all': noTransitionAll,
  'no-arbitrary-spacing-radius': noArbitrarySpacingRadius,
  'prefer-size-utility': preferSizeUtility,
  'no-classname-template-ternary': noClassnameTemplateTernary,
  'motion-safe-animations': motionSafeAnimations,
};

/**
 * ESLint core rules that map 1:1 to written rules in AGENTS.md > TypeScript Style
 * ("prefer const", "template literals over concatenation", "object shorthand", ES modules).
 */
const CORE_RULES = {
  'no-var': 'error',
  'prefer-const': 'error',
  'object-shorthand': ['error', 'always'],
  'prefer-template': 'error',
};

/**
 * Turn a rule map into `{ "skateboard/<name>": "error" }`.
 *
 * @param {Record<string, unknown>} rules - Rule modules keyed by name
 * @returns {Record<string, 'error'>} Flat-config rule settings
 */
const asErrors = (rules) => Object.fromEntries(Object.keys(rules).map((name) => [`${NAMESPACE}/${name}`, 'error']));

const plugin = {
  meta: { name: 'eslint-plugin-skateboard', version: '1.0.0', namespace: NAMESPACE },
  rules: { ...BASE_RULES, ...APP_RULES },
  /** @type {Record<string, import('eslint').Linter.Config>} */
  configs: {},
};

plugin.configs = {
  /** Every linted JS/TS file: TypeScript discipline, imports, layers, errors, tests, docs. */
  base: {
    name: 'skateboard/base',
    plugins: { [NAMESPACE]: plugin },
    rules: { ...CORE_RULES, ...asErrors(BASE_RULES) },
  },
  /** Browser app code (src/): React, accessibility, styling, data fetching. */
  app: {
    name: 'skateboard/app',
    plugins: { [NAMESPACE]: plugin },
    rules: asErrors(APP_RULES),
  },
};

export { parser, BASE_RULES, APP_RULES, CORE_RULES };
export default plugin;
