# Icon Rules

## Icon Library: Lucide React

Skateboard uses [Lucide](https://lucide.dev/icons) via `lucide-react`.

```jsx
import { Plus, Trash2, Settings } from "lucide-react";
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

- Don't use emoji as icons in UI (`🔐` → `Lock`)
- Don't use Tabler, Heroicons, or Font Awesome — Lucide only
- Don't mix icon libraries in the same project
- Don't use icons without sizing — always set `size`
- Don't use raw SVGs when a Lucide icon exists
