# Styling Rules

## Do / Don't

| Do | Don't |
|----|-------|
| Use `bg-background`, `bg-card`, `bg-accent` | Use `bg-white`, `bg-gray-100`, `bg-[#fff]` |
| Use `text-foreground`, `text-muted-foreground` | Use `text-black`, `text-gray-500`, `text-[#333]` |
| Use `border-border`, `border-input` | Use `border-gray-200`, `border-[#e5e5e5]` |
| Use `gap-*` for spacing between elements | Use `mr-*`, `ml-*` between siblings |
| Use `rounded-md` / `rounded-lg` (design token) | Use `rounded-[12px]` or arbitrary values |
| Use `text-heading-*`, `text-copy-*`, `text-label-*` | Use raw `text-sm font-semibold` combinations |
| Use `material-*` elevation utilities | Use manual `shadow-*` + `bg-*` combos |
| Use `text-destructive` for errors | Use `text-red-500` |
| Use `text-success`, `text-warning`, `text-info` | Use `text-green-500`, `text-yellow-500`, `text-blue-500` |
| Use `--color-app` for brand color | Use hardcoded hex or raw Tailwind color |

## Color Palette Constraint

Limit your palette to **3-5 semantic colors**:

1. **`--color-app`** — Brand/primary actions
2. **`--destructive`** — Errors, dangerous actions
3. **`--success`** — Confirmations, positive states
4. **`--warning`** — Caution, attention needed
5. **`--muted-foreground`** — Secondary text, descriptions

Never introduce raw Tailwind colors (`blue-500`, `green-400`) when a semantic token exists.

## Spacing Rules

- Use `gap-*` between flex/grid children — never margin between siblings
- Use `p-*` for internal padding
- Never use `space-x-*` or `space-y-*` — always use `gap-*`
- Prefer Tailwind scale values (`p-4`, `gap-6`) — never arbitrary values (`p-[16px]`, `gap-[24px]`)
- Standard spacing scale: `1` (4px), `2` (8px), `3` (12px), `4` (16px), `6` (24px), `8` (32px)

## Layout Rules

- Use `size-*` for square elements — never `w-10 h-10` when `size-10` works
- Use `cn()` for conditional class composition — never template literal ternaries
- Design mobile-first — use `min-width` breakpoints (`sm:`, `md:`, `lg:`), enhance upward
- Never use `transition-all` — be specific (`transition-colors`, `transition-opacity`, `transition-transform`)
- Never generate abstract decorative shapes (gradient circles, blurry blobs, decorative SVGs)

## Dark Mode

- Always use semantic tokens (`bg-background`, `text-foreground`) — they auto-switch
- Test both light and dark mode — never assume one
- Never use manual `dark:` overrides — semantic tokens handle theme switching automatically

## Typography

- Max 2 font families — 1 heading + 1 body (default: Geist Sans + Geist Mono)
- Use `text-balance` or `text-pretty` on headings and titles

Use the typography scale utilities (defined in `styles.css`):

| Utility | Use For |
|---------|---------|
| `text-heading-xl` | Page titles |
| `text-heading-lg` | Section headings |
| `text-heading-md` | Card titles |
| `text-heading-sm` | Sub-headings |
| `text-label-lg` | Large labels |
| `text-label-md` | Form labels, nav items |
| `text-label-sm` | Small labels, badges |
| `text-copy-lg` | Body text, descriptions |
| `text-copy-md` | Default body text |
| `text-copy-sm` | Help text, captions |

## Elevation / Materials

Use material utilities for layered surfaces:

| Utility | Use For |
|---------|---------|
| `material-base` | Default page surface |
| `material-raised` | Cards, raised sections |
| `material-elevated` | Popovers, floating elements |
| `material-menu` | Dropdown menus, context menus |
| `material-modal` | Dialogs, sheets, modals |
