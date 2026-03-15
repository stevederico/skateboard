# Icon Rules

## Icon Library: Tabler Icons

Skateboard uses [Tabler Icons](https://tabler.io/icons) via `@tabler/icons-react`.

```jsx
import { IconPlus, IconTrash, IconSettings } from "@tabler/icons-react";
```

## Naming Convention

Tabler icons use `Icon` prefix + PascalCase:
- `lock` → `IconLock`
- `credit-card` → `IconCreditCard`
- `chart-bar` → `IconChartBar`
- `layout-dashboard` → `IconLayoutDashboard`

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
<IconCheck size={16} />

{/* In a button */}
<Button>
  <IconPlus size={18} />
  Add Item
</Button>

{/* Icon-only button */}
<Button variant="ghost" size="icon" aria-label="Delete item">
  <IconTrash size={18} />
</Button>
```

## Accessibility

### Icon-Only Buttons

Every icon-only button MUST have `aria-label`:

```jsx
{/* Correct */}
<Button variant="ghost" size="icon" aria-label="Close dialog">
  <IconX size={18} />
</Button>

{/* Wrong — no accessible name */}
<Button variant="ghost" size="icon">
  <IconX size={18} />
</Button>
```

### Decorative Icons

Icons next to text are decorative — add `aria-hidden`:

```jsx
<Button>
  <IconPlus size={18} aria-hidden="true" />
  Add Item
</Button>
```

When the text already describes the action, the icon is purely visual.

### Informational Icons

Icons that convey meaning without text need `aria-label`:

```jsx
<IconAlertTriangle size={16} aria-label="Warning" className="text-warning" />
```

## Stroke Width

Default stroke width is `2`. Use `1.5` for a lighter feel in dense UIs:

```jsx
<IconSettings size={18} stroke={1.5} />
```

## Don't

- Don't use emoji as icons in UI (`🔐` → `IconLock`)
- Don't use Lucide, Heroicons, or Font Awesome — Tabler only
- Don't mix icon libraries in the same project
- Don't use icons without sizing — always set `size`
- Don't use raw SVGs when a Tabler icon exists
