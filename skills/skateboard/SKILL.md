# Skateboard UI Skill

**Before building any UI with Skateboard, follow these four commandments.**

## The Four Commandments

1. **Use skateboard-ui shadcn primitives** — never raw HTML when a component exists
2. **Use semantic design tokens** — never raw colors, hardcoded radii, or magic numbers
3. **Compose from patterns** — Cards, Dialogs, Forms have defined structures; follow them
4. **Validate accessibility** — every interactive element needs a label, keyboard support, and contrast

## Component Selection Table

Pick the right component for the job. If a component exists, use it — don't reinvent it.

| Need | Use | Not |
|------|-----|-----|
| Action trigger | `<Button>` | `<button>`, `<a onClick>` |
| Text input | `<Input>` + `<Label>` | `<input>` |
| Long text input | `<Textarea>` + `<Label>` | `<textarea>` |
| Single select | `<Select>` | `<select>`, custom dropdown |
| Multi-option toggle | `<ToggleGroup>` | Radio buttons, checkboxes |
| Boolean toggle | `<Switch>` + `<Label>` | `<input type="checkbox">` |
| Content container | `<Card>` | `<div className="card">` |
| Modal content | `<Dialog>` | `<div className="modal">` |
| Side panel | `<Sheet>` | absolute-positioned div |
| Bottom panel (mobile) | `<Drawer>` | fixed-bottom div |
| Navigation | `<NavigationMenu>` | `<nav>` with custom links |
| Tabbed content | `<Tabs>` | Manual tab implementation |
| Data display | `<Table>` | `<table>` |
| Loading state | `<Spinner>` or `<Skeleton>` | Custom spinner div |
| Empty state | `<Empty>` | Conditional text |
| Toast notification | `toast()` from sonner | `alert()`, custom toast |
| Dropdown actions | `<DropdownMenu>` | Custom popover |
| Confirmation | `<AlertDialog>` | `confirm()`, `window.confirm` |
| Form field group | `<Field>` | Manual label+input+error div |
| Keyboard shortcut | `<Kbd>` | `<code>` or `<span>` |
| Progress indicator | `<Progress>` | Custom progress bar |
| Grouped buttons | `<ButtonGroup>` | Adjacent buttons |
| List item | `<Item>` | `<li>` or custom div |

## Rules Index

Read these before building:

- **[Styling](rules/styling.md)** — Color tokens, spacing, semantic classes
- **[Composition](rules/composition.md)** — Component nesting, Card/Dialog/Form patterns
- **[Forms](rules/forms.md)** — Label+Input pairing, validation, option groups
- **[Icons](rules/icons.md)** — Lucide icons, sizing, accessibility
- **[Guidelines](rules/guidelines.md)** — Top 30 web interface guidelines
- **[Views](rules/views.md)** — Page layout, headers, data fetching patterns

## Design Configuration

The `constants.json` file contains a `design` block that defines the app's visual identity:

```json
"design": {
  "baseColor": "neutral",
  "radius": "medium",
  "font": "geist",
  "iconLibrary": "lucide"
}
```

Respect these values when building UI. Don't override the design system — extend within it.
