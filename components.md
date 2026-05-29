---
layout: default
title: Components
description: App components in src/components plus the shadcn primitives and styling conventions shipped with skateboard-ui
---

# Components

Skateboard uses an Application Shell Architecture: the shell (`@stevederico/skateboard-ui`) provides routing, auth, context, and a full set of shadcn primitives, while your app supplies the views in `src/components`. This page covers the components shipped in the boilerplate's `src/components`, the shadcn primitives you compose with, and the styling/composition conventions from the Skateboard skill rules.

## App Components

These ship in the boilerplate's `src/components/`. They are your code — the update script never overwrites them. Each is a starting point you adapt for your app.

### BlankView.jsx

Reusable empty-state view template. Default export `BlankView`.

```jsx
import BlankView from '@/components/BlankView';

<BlankView
  title="Projects"
  description="Create your first project to get started."
  buttonTitle="Create Project"
  onButtonClick={handleCreate}
/>
```

Props: `title` (default `"Blank"`), `description`, `buttonTitle`, `onButtonClick`, `icon` (ReactNode, default `<LayoutDashboard size={24} />`), `children` (replaces the empty state when provided). Renders the shell `<Header>` plus shadcn `Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription`; the CTA `<Button>` (with a `<Plus>` icon) only appears when `buttonTitle` is set. Used three times in `main.jsx` for the Analytics, Projects, and Team routes.

### HomeView.jsx

Dashboard view, lazy-loaded in `main.jsx`. Default export `HomeView`. No props. Renders `<Header title="Documents" />` and `<SectionCards />` inside an `@container/main` layout.

```jsx
import HomeView from '@/components/HomeView';

<HomeView />
```

### SectionCards.jsx

Named export `SectionCards` (not a default export). No props. Four hardcoded metric cards (Total Revenue, New Customers, Active Accounts, Growth Rate) built from shadcn `Card`/`Badge` with `TrendingUp`/`TrendingDown` icons, laid out in a responsive grid (`@xl/main:grid-cols-2 @5xl/main:grid-cols-4`). Static demo data you replace with real metrics.

```jsx
import { SectionCards } from '@/components/SectionCards';

<SectionCards />
```

### ChatView.jsx

Demo chat interface with usage tracking and upgrade gating. Default export `ChatView`. No props. Uses `useUser`/`useDispatch` from skateboard-ui Context and `getRemainingUsage`/`trackUsage`/`showUpgradeSheet` from Utilities. Non-subscribers are gated when remaining usage reaches `0` (which opens the `UpgradeSheet`); the header shows the remaining count as a pill button. Sending requires auth — it dispatches `SHOW_AUTH_OVERLAY` if there is no user.

```jsx
import ChatView from '@/components/ChatView';

<ChatView />
```

### CommandMenu.jsx

Global Cmd+K / Ctrl+K command palette. Default export `CommandMenu`. No props. Reads `state.constants.pages` via `getState()` and uses the shadcn `CommandDialog`/`Command` family (cmdk). Selecting a page calls `navigate('/app/' + page.url)`. It is injected app-wide by `AppLayout` (the layout override passed to `createSkateboardApp`).

```jsx
import CommandMenu from '@/components/CommandMenu';

<CommandMenu />
```

### LandingSpecSheet.jsx

Public marketing landing page, passed as the `landingPage` prop to `createSkateboardApp`. Default export `LandingSpecSheet`. No props — it reads everything from `state.constants` via `getState()`. Sections: sticky header, hero, Features grid (from `features.items`), Pricing card (from `stripeProducts[0]` + `pricing.extras`), CTA banner, and footer. Its CTA calls `goApp` (navigates to `/app`) — it does not start Stripe checkout.

```jsx
import LandingSpecSheet from '@/components/LandingSpecSheet';

createSkateboardApp({ constants, appRoutes, defaultRoute: 'home', landingPage: <LandingSpecSheet /> });
```

### CalendarTestView.jsx

QA harness for the shadcn `Calendar` primitive. Default export `CalendarTestView`. No props. Demonstrates `mode="single"`, `mode="range"`, `captionLayout="dropdown"`, and disabled dates. It is wired to the `calendar-test` route but is not listed in `constants.pages`, so it has no sidebar or command-menu entry — reach it by direct URL.

```jsx
import CalendarTestView from '@/components/CalendarTestView';

<CalendarTestView />
```

## shadcn Primitives

Compose your views from the shadcn primitives provided by the shell. They are imported from `@stevederico/skateboard-ui/shadcn/ui/<component>` — they are not vendored into your app's `src/`.

```jsx
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
```

### Available components

`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `avatar`, `badge`, `breadcrumb`, `button`, `button-group`, `calendar`, `card`, `carousel`, `chart`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `empty`, `field`, `hover-card`, `input`, `input-group`, `item`, `kbd`, `label`, `menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `spinner`, `switch`, `table`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`

### Rules

- Prefer shadcn components over raw HTML — use `<Button>` not `<button>`, `<Card>` not `<div className="card">`.
- Many primitives use compound (sub-component) patterns, not prop APIs — read the source before first use.
- Combine primitives with Tailwind utility classes for layout and spacing.

### Component Selection

Use the right component for the job:

| Need | Use | Not |
|------|-----|-----|
| Action | `<Button>` | `<button>` |
| Text input | `<Input>` + `<Label>` | `<input>` |
| Modal | `<Dialog>` | custom div |
| Confirmation | `<AlertDialog>` | `confirm()` |
| Toast | `toast()` | `alert()` |
| Loading | `<Spinner>` / `<Skeleton>` | custom div |
| Empty state | `<Empty>` | conditional text |
| Side panel | `<Sheet>` | absolute div |

## Composition Patterns

### Card

Cards are the primary content container. Always use the full structure.

```jsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@stevederico/skateboard-ui/shadcn/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Optional description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Main content — use gap-4 for vertical spacing */}
  </CardContent>
  <CardFooter>
    {/* Actions align right with justify-end */}
  </CardFooter>
</Card>
```

- Always include `CardHeader` with `CardTitle`.
- Never put raw content directly inside `<Card>` without `CardContent`.
- Never nest a Card inside another Card.

### Dialog

Dialogs are for focused tasks requiring user attention.

```jsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@stevederico/skateboard-ui/shadcn/ui/dialog';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Describe the action</DialogDescription>
    </DialogHeader>
    {/* Body content */}
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- `DialogDescription` is required for accessibility.
- Always provide a Cancel action; destructive actions use `variant="destructive"`.
- Use `AlertDialog` for destructive confirmations — never `confirm()`.

### Form

Combine `Field`, `Label`, and `Input`.

```jsx
import { Field } from '@stevederico/skateboard-ui/shadcn/ui/field';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';

<form onSubmit={handleSubmit} className="flex flex-col gap-4">
  <Field>
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
  </Field>
  <Button type="submit">Save</Button>
</form>
```

- Every `Input` needs a paired `Label` with matching `htmlFor`/`id`.
- Use `gap-4` on the form — never margin between fields.
- Submit button is last, outside any `Field` wrapper.

### Sheet

For supplementary content that slides in from the edge (detail panels, filters, settings).

```jsx
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@stevederico/skateboard-ui/shadcn/ui/sheet';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';

<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline">Details</Button>
  </SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Details</SheetTitle>
      <SheetDescription>View full details</SheetDescription>
    </SheetHeader>
    {/* Content */}
  </SheetContent>
</Sheet>
```

### Nesting

- Max 3 levels of component nesting (e.g., Card > Form > Field) — flat is better than deep.
- Use `flex` + `gap` for linear layouts, `grid` + `gap` for 2D layouts.
- Never nest Cards inside Cards, or Dialogs inside Dialogs.

## View Patterns

Every data-fetching view handles three states — loading, error, and data — and uses `useListData` from the shell rather than fetching in `useEffect` directly.

```jsx
import { useListData } from '@stevederico/skateboard-ui/Utilities';
import Header from '@stevederico/skateboard-ui/Header';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/shadcn/ui/empty';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { CircleAlert } from '@stevederico/skateboard-ui/icons';

export default function ProjectsView() {
  const { data, loading, error, refetch } = useListData('/projects');

  if (loading) {
    return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;
  }

  if (error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><CircleAlert size={24} /></EmptyMedia>
          <EmptyTitle>Failed to load projects</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
        <Button onClick={refetch}>Try again</Button>
      </Empty>
    );
  }

  return (
    <main className="flex flex-col gap-6 p-6">
      <Header title="Projects" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.map((item) => <ProjectCard key={item.id} {...item} />)}
      </div>
    </main>
  );
}
```

- Page titles use `text-heading-lg`; descriptions use `text-copy-md text-muted-foreground`.
- Show `<Skeleton>` shapes during loading that match the content layout.
- Show `<Empty>` when `data` is an empty array.
- No breadcrumbs — the sidebar provides navigation context.

### Header

Use the shell `Header`'s `children` for right-side actions, or `buttonTitle`/`onButtonTitleClick` for a simple text button.

```jsx
import Header from '@stevederico/skateboard-ui/Header';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Plus } from '@stevederico/skateboard-ui/icons';

<Header title="Projects">
  <Button size="sm"><Plus size={18} aria-hidden="true" /> New Project</Button>
</Header>

<Header title="Settings" buttonTitle="Save" onButtonTitleClick={handleSave} />
```

## Icons

Skateboard uses the [Lucide](https://lucide.dev/icons) icon set, vendored into the shell (3.0+). Import named icons from `@stevederico/skateboard-ui/icons` — there is no `lucide-react` dependency. Icon names are PascalCase with no prefix (`credit-card` → `CreditCard`).

```jsx
import { Home, Settings, User, Menu } from '@stevederico/skateboard-ui/icons';

<Home size={18} />
<Settings size={18} />
```

For icons whose name lives in a constant (e.g. `constants.appIcon`, `pages[].icon`), render them by name with `DynamicIcon`:

```jsx
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';

<DynamicIcon name="home" size={18} />
```

### Sizing

| Context | Size | Class |
|---------|------|-------|
| Inline with text | `16` | `size-4` |
| Button icon | `18` | `size-4.5` |
| Card feature icon | `24` | `size-6` |
| Empty state | `48` | `size-12` |
| Hero illustration | `64` | `size-16` |

### Accessibility

- Icon-only buttons must have `aria-label` describing the action.
- Decorative icons next to text get `aria-hidden="true"`.
- Informational icons (no text) need `aria-label`.

```jsx
{/* Icon-only button */}
<Button variant="ghost" size="icon" aria-label="Delete item">
  <Trash2 size={18} />
</Button>

{/* Decorative icon next to text */}
<Button>
  <Plus size={18} aria-hidden="true" />
  Add Item
</Button>
```

Don't use emoji as UI icons, don't mix icon libraries (Lucide only), and don't render icons without a `size`.

## Styling

Tailwind CSS v4 is wired through the `@tailwindcss/vite` plugin only — no PostCSS, no `tailwind.config.js`, no autoprefixer. Your app owns a tiny `src/assets/styles.css` that imports the shell's theme and sets the brand color:

```css
/* src/assets/styles.css */
@import "@stevederico/skateboard-ui/styles.css";

@source '../../node_modules/@stevederico/skateboard-ui';

@theme {
  --color-app: var(--color-purple-500);
}
```

`@import` pulls in the full shadcn theme base, `@source` tells Tailwind to scan the shell package for classes, and `--color-app` is the single brand override (`bg-app`, `text-app`).

### Do / Don't

| Do | Don't |
|----|-------|
| `bg-background`, `bg-card`, `bg-accent` | `bg-white`, `bg-gray-100`, `bg-[#fff]` |
| `text-foreground`, `text-muted-foreground` | `text-black`, `text-gray-500` |
| `border-border`, `border-input` | `border-gray-200` |
| `gap-*` for spacing between elements | `mr-*` / `ml-*` between siblings, `space-x-*` / `space-y-*` |
| `rounded-md` / `rounded-lg` | `rounded-[12px]` |
| `text-heading-*`, `text-copy-*`, `text-label-*` | raw `text-sm font-semibold` |
| `material-*` elevation utilities | manual `shadow-*` + `bg-*` |
| `text-destructive` / `text-success` / `text-warning` / `text-info` | `text-red-500`, `text-green-500` |
| `--color-app` for brand color | hardcoded hex |
| `size-*` for squares | `w-10 h-10` |
| `cn()` for conditional classes | template-literal ternaries |

### Spacing & layout

- Use `gap-*` between flex/grid children; `p-*` for internal padding.
- Stick to the Tailwind scale (`1`=4px, `2`=8px, `3`=12px, `4`=16px, `6`=24px, `8`=32px) — no arbitrary values.
- Design mobile-first with `min-width` breakpoints (`sm:`, `md:`, `lg:`).
- Never use `transition-all` — be specific (`transition-colors`, `transition-opacity`, `transition-transform`).

### Typography scale

| Utility | Use For |
|---------|---------|
| `text-heading-xl` | Page titles |
| `text-heading-lg` | Section headings |
| `text-heading-md` | Card titles |
| `text-heading-sm` | Sub-headings |
| `text-label-lg` / `text-label-md` / `text-label-sm` | Labels, nav items, badges |
| `text-copy-lg` / `text-copy-md` / `text-copy-sm` | Body text, descriptions, captions |

Use `text-balance`/`text-pretty` on headings, `tabular-nums` on prices and stats, and a max of two font families (Geist Sans + Geist Mono).

### Elevation

Use the material utilities for layered surfaces: `material-base` (page), `material-raised` (cards), `material-elevated` (popovers), `material-menu` (dropdowns), `material-modal` (dialogs and sheets).

### Dark mode

Dark mode works automatically through semantic tokens — `bg-background`, `text-foreground`, and friends switch with the theme. Never write manual `dark:` overrides. The `design` block in `constants.json` configures the base look:

```json
"design": {
  "baseColor": "neutral",
  "radius": "medium",
  "font": "geist",
  "iconLibrary": "lucide"
}
```

Test both light and dark modes — never assume one.

## See Also

- [Configuration]({{ '/configuration' | relative_url }}) — `constants.json` keys, including `pages`, `design`, and `stripeProducts`
- [Authentication]({{ '/authentication' | relative_url }}) — sign-in/sign-up flow and protected routes
- [Examples]({{ '/examples' | relative_url }}) — end-to-end view examples
