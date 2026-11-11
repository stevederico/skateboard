# Icon Rules

## Icon Library: Lucide React

Skateboard uses [Lucide](https://lucide.dev/icons) via `lucide-react`.

- **One funnel:** `src/icons.ts` is the only file that imports `lucide-react`. It re-exports an explicit, named list of every icon the app uses (no `export *`)
- **App code:** imports icons from the funnel: `import { Plus, Trash2 } from "../icons"`
- **New icon:** add its Lucide name to the list in `src/icons.ts`, then import it from the funnel
- **Why:** one list keeps the icon set auditable and tree-shakeable, and lets the app swap any icon for a vendored SVG in one place (rename the file to `icons.tsx` once it holds JSX)
- **ui 5.0+:** `lucide-react` is a runtime dependency of `@stevederico/skateboard-ui` and stays in the app's `dependencies` (the boilerplate lists it)
- **constants.json** icon strings (pages/features/appIcon) are resolved by the shell privately — do not use public DynamicIcon
- `npm run lint` enforces the funnel (`skateboard/icons-through-funnel`) and bans deep paths (`lucide-react/dist/...`, `lucide-react/icons/...`, `node_modules/...`)

```ts
// src/icons.ts
export { Plus, Settings, Trash2 } from "lucide-react";
```

```jsx
// src/components/ProjectsView.tsx
import { Plus, Trash2, Settings } from "../icons";
```

## Naming Convention

Lucide icons use PascalCase with no prefix:
- `lock` → `Lock`
- `credit-card` → `CreditCard`
- `chart-bar` → `ChartBar`
- `layout-dashboard` → `LayoutDashboard`

## Sizing

Use consistent sizes with the `size` prop:

| Context | Size | Class |
|---------|------|-------|
| Inline with text | `16` | `size-4` |
| Button icon | `18` | `size-4.5` |
| Card feature icon | `24` | `size-6` |
| Empty state | `48` | `size-12` |
| Hero illustration | `64` | `size-16` |

```jsx
{/* Inline with text */}
<Check size={16} />

{/* In a button */}
<Button>
  <Plus size={18} />
  Add Item
</Button>

{/* Icon-only button */}
<Button variant="ghost" size="icon" aria-label="Delete item">
  <Trash2 size={18} />
</Button>
```

## Accessibility

### Icon-Only Buttons

Every icon-only button MUST have `aria-label`:

```jsx
{/* Correct */}
<Button variant="ghost" size="icon" aria-label="Close dialog">
  <X size={18} />
</Button>

{/* Wrong — no accessible name */}
<Button variant="ghost" size="icon">
  <X size={18} />
</Button>
```

### Decorative Icons

Icons next to text are decorative — add `aria-hidden`:

```jsx
<Button>
  <Plus size={18} aria-hidden="true" />
  Add Item
</Button>
```

When the text already describes the action, the icon is purely visual.

### Informational Icons

Icons that convey meaning without text need `aria-label`:

```jsx
<TriangleAlert size={16} aria-label="Warning" className="text-warning" />
```

## Stroke Width

Default stroke width is `2`. Use `strokeWidth={1.5}` for a lighter feel in dense UIs:

```jsx
<Settings size={18} strokeWidth={1.5} />
```

## Don't

- Don't import `lucide-react` outside `src/icons.ts` — import from the funnel
- Don't import deep paths (`lucide-react/dist/...`, `lucide-react/icons/...`, `node_modules/...`, `@stevederico/skateboard-ui/dist/...`)
- Don't import from `@stevederico/skateboard-ui/icons` — gone in skateboard-ui **5.0**; add the icon to `src/icons.ts`
- Don't use public `DynamicIcon` — gone in **5.0**; named-import icons from the funnel in app code
- Don't use emoji as icons in UI (`🔐` → `Lock`)
- Don't use Tabler, Heroicons, or Font Awesome — Lucide only
- Don't mix icon libraries in the same project
- Don't use icons without sizing — always set `size`
- Don't use raw SVGs when a Lucide icon exists
