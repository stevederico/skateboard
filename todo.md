# todo

## Router from skateboard-ui (5.18.0)

Done: pinned `@stevederico/skateboard-ui` 5.16.0, which vendors react-router 7.18.5 and
exports it as `@stevederico/skateboard-ui/router`. `react-router` left `package.json`,
the lockfile and `vite.config.ts` (`resolve.dedupe`, `optimizeDeps.include`); `src/`
has no router imports (it navigates with `useSafeNavigate()`). `@types/node` is gone:
`tsconfig.json` checks only `src` with `types: ["vite/client"]`. The
`no-direct-react-router` rule points at the new import path. AGENTS.md, README,
docs/UPGRADE.md (5.18.0 note), docs/GUIDE.md and the skateboard skill describe it.
Checked: typecheck, lint, guardrail tests, `npm test`, depcruise, build, `npm run verify`,
and a manual browser pass (landing, sign up, every sidebar page, command menu, settings,
sign out, sign in, legal pages, 404, back and forward, icons).

- [ ] Router security advisories: the router moves only with the skateboard-ui pin, and
  `npm audit` no longer sees it. Bump the pin when skateboard-ui re-vendors.
- [ ] `vite.config.ts`, `vite.plugins.ts` and `scripts/verify-ui-version.ts` are no longer
  typechecked (they left `tsconfig.json` with `@types/node`). Their tests still run
  (`npm run test:build`). Add a separate Node tsconfig only if they need the type gate.

## Plain CSS, no Tailwind (5.20.0)

Done: pinned `@stevederico/skateboard-ui` 5.18.0, which ships plain CSS for its own
components and theme. `tailwindcss` and `@tailwindcss/vite` left `package.json`, the
lockfile and `vite.config.ts`. `src/assets/styles.css` is now plain CSS (written once by
skateboard-ui's `scripts/tailwind-to-css.js`, edited by hand from now on): the classes
`src/` uses that skateboard-ui does not define, a few shell rules repeated after them so
they keep their precedence, `:root` brand variables and `.dark` overrides. New lint rule
`no-unknown-classes` checks every className token against both CSS files;
`no-banned-build-tooling` bans Tailwind imports. Built CSS 128,052 to 126,479 bytes
(gzip 20,058 to 19,274). Light and dark screenshots of ten screens are pixel-identical
before and after. Docs (AGENTS.md, README, GUIDE, UPGRADE 5.20.0 note, skill) describe it.

- [ ] A new className needs its rule in `src/assets/styles.css` (plain CSS using the theme
  variables); the lint error says which token is missing.

## No more `shadcn` paths (5.19.0)

Done: pinned `@stevederico/skateboard-ui` 5.17.0, which removed the `./shadcn/*` exports.
`src/` imports `@stevederico/skateboard-ui/ui/*` (CommandMenu, BlankView, SectionCards);
`grep -rn "skateboard-ui/shadcn" src` prints nothing. Lint rule
`no-removed-skateboard-ui-imports` reports any leftover with its new path. AGENTS.md,
docs/UPGRADE.md (5.19.0 note), the skill, the rule messages and depcruise messages use
the new paths. Prose that names the shadcn design system (upstream) stays.
