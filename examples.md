---
layout: default
title: Examples
description: Real-world examples and code snippets for building with Skateboard v3.4.0
---

# Examples

Real-world examples and code snippets to help you build with Skateboard.

All examples follow the Application Shell Architecture: views live in `src/components/`, import shadcn primitives and icons from the `@stevederico/skateboard-ui` package, and talk to the backend through the `apiRequest` utility (which auto-includes credentials and the CSRF token — never read a token from `localStorage`). See [Components]({{ '/components' | relative_url }}), [API]({{ '/api' | relative_url }}), and [Authentication]({{ '/authentication' | relative_url }}) for the full reference.

## View Examples

### Empty-state View (BlankView)

The boilerplate ships `BlankView`, a reusable empty-state template used by the Analytics, Projects, and Team routes in `src/main.tsx`. It composes the shell `<Header>` with the shadcn `Empty` compound component.

```tsx
// src/components/BlankView.tsx
import type { ReactNode } from 'react';
import Header from '@stevederico/skateboard-ui/Header';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/shadcn/ui/empty';
import { LayoutDashboard, Plus } from '@stevederico/skateboard-ui/icons';

/** Props for the BlankView starter template. */
interface BlankViewProps {
  /** Header title */
  title?: string;
  /** Empty state description text */
  description?: string;
  /** CTA button text (e.g. "Create Project") */
  buttonTitle?: string;
  /** CTA button click handler */
  onButtonClick?: () => void;
  /** Custom icon element for empty state */
  icon?: ReactNode;
  /** Optional content to replace empty state */
  children?: ReactNode;
}

export default function BlankView({ title = "Blank", description, buttonTitle, onButtonClick, icon, children }: BlankViewProps) {
  return (
    <>
      <Header title={title} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {children || (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {icon || <LayoutDashboard size={24} />}
                </EmptyMedia>
                <EmptyTitle>No {title.toLowerCase()} yet</EmptyTitle>
                <EmptyDescription>
                  {description || `${title} will appear here once you get started.`}
                </EmptyDescription>
              </EmptyHeader>
              {buttonTitle && (
                <Button onClick={onButtonClick}>
                  <Plus size={18} />
                  {buttonTitle}
                </Button>
              )}
            </Empty>
          </div>
        )}
      </div>
    </>
  );
}
```

Wire it up in `src/main.tsx` via `appRoutes`. `appRoutes` is a typed **array** of `{ path, element }` objects (paths are relative — no leading slash):

```tsx
// src/main.tsx
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import type { AppRoute } from '@stevederico/skateboard-ui/App';
import BlankView from './components/BlankView';

const appRoutes: AppRoute[] = [
  {
    path: 'projects',
    element: <BlankView
      title="Projects"
      description="Create your first project to get started."
      buttonTitle="Create Project"
    />,
  },
];
```

### Data-fetching View

Every data view handles three states — loading, error, and data — and fetches with `useListData` (never fetch in `useEffect` directly). `useListData` returns `{ data, loading, error, refetch }` and calls the backend through `apiRequest`.

```tsx
// src/components/ProjectsView.tsx
import Header from '@stevederico/skateboard-ui/Header';
import { useListData } from '@stevederico/skateboard-ui/Utilities';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@stevederico/skateboard-ui/shadcn/ui/empty';
import { CircleAlert, Folder } from '@stevederico/skateboard-ui/icons';

/** A single project record returned by GET /api/projects. */
interface Project {
  id: string;
  name: string;
  description: string;
}

export default function ProjectsView() {
  const { data, loading, error, refetch } = useListData<Project>('/projects');

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
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

  if (data.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Folder size={24} /></EmptyMedia>
          <EmptyTitle>No projects yet</EmptyTitle>
          <EmptyDescription>Create your first project to get started.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Header title="Projects" />
      <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
        {data.map(project => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle>{project.name}</CardTitle>
            </CardHeader>
            <CardContent>{project.description}</CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
```

### Dashboard with Metric Cards

The boilerplate ships `SectionCards`, a static metric grid using the shadcn `Card` and `Badge` primitives with Lucide trend icons. `HomeView` renders it inside an `@container/main` layout.

```tsx
// src/components/SectionCards.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { TrendingUp, TrendingDown } from '@stevederico/skateboard-ui/icons';

/** A single dashboard metric card. */
interface MetricCard {
  title: string;
  value: string;
  trend: string;
  up: boolean;
}

export function SectionCards() {
  const cards: MetricCard[] = [
    { title: "Total Revenue", value: "$1,250.00", trend: "+12.5%", up: true },
    { title: "New Customers", value: "1,234", trend: "-20%", up: false },
    { title: "Active Accounts", value: "45,678", trend: "+12.5%", up: true },
    { title: "Growth Rate", value: "4.5%", trend: "+4.5%", up: true },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map(card => (
        <Card key={card.title}>
          <CardHeader>
            <CardDescription>{card.title}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">{card.value}</CardTitle>
          </CardHeader>
          <CardFooter>
            <Badge variant="outline">
              {card.up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {card.trend}
            </Badge>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
```

```tsx
// src/components/HomeView.tsx
import Header from '@stevederico/skateboard-ui/Header';
import { SectionCards } from './SectionCards';

export default function HomeView() {
  return (
    <>
      <Header title="Documents" />
      <div className="@container/main flex flex-1 flex-col gap-4 p-6">
        <SectionCards />
      </div>
    </>
  );
}
```

## Form Examples

### Form with useForm

Use the shell `useForm` hook for form state. It returns `{ values, handleChange, handleSubmit, reset, submitting, error }`. Validate on submit, pair every `Input` with a `Label`, wrap pairs in `Field`, use `gap-*` for spacing, and keep submit enabled until submission.

```tsx
// src/components/SettingsForm.tsx
import Header from '@stevederico/skateboard-ui/Header';
import { useForm, apiRequest } from '@stevederico/skateboard-ui/Utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Field } from '@stevederico/skateboard-ui/shadcn/ui/field';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';

/** Props for the SettingsForm view. */
interface SettingsFormProps {
  /** Authenticated user whose profile is being edited */
  user?: { name?: string };
}

/** Editable profile fields posted to PUT /api/me. */
interface ProfileValues {
  name: string;
}

export default function SettingsForm({ user }: SettingsFormProps) {
  const { values, handleChange, handleSubmit, submitting, error } = useForm<ProfileValues>(
    { name: user?.name ?? '' },
    async (formValues: ProfileValues) => {
      // PUT /api/me whitelists only `name`
      await apiRequest('/me', {
        method: 'PUT',
        body: JSON.stringify({ name: formValues.name }),
      });
    }
  );

  return (
    <>
      <Header title="Settings" />
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                value={values.name}
                onChange={handleChange('name')}
              />
            </Field>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner /> : 'Save'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
```

> Note: the shell's `useForm` exposes `handleChange` as a curried helper — call `handleChange('name')` to get the `onChange` handler for the `name` field.

> Authentication forms (sign up / sign in) are provided by the shell. `createSkateboardApp` auto-mounts `/signin` and `/signup`, which post to `POST /api/signup` (`{ email, password, name }`) and `POST /api/signin` (`{ email, password }`) and set the HttpOnly `token` and `csrf_token` cookies. You don't build these yourself — see [Authentication]({{ '/authentication' | relative_url }}).

## Stripe / Checkout Example

The shell handles checkout end to end. The app only displays pricing from `constants.stripeProducts`; the upgrade flow lives in `@stevederico/skateboard-ui`. To trigger checkout from your own UI, call `showCheckout` — it posts `{ lookup_key, email }` to `POST /api/checkout` (with CSRF + credentials) and redirects to the returned Stripe URL.

```tsx
// src/components/UpgradeButton.tsx
import { showCheckout } from '@stevederico/skateboard-ui/Utilities';
import { useUser } from '@stevederico/skateboard-ui/Context';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';

export default function UpgradeButton() {
  const user = useUser();

  // showCheckout(email, productIndex = 0) reads
  // constants.stripeProducts[productIndex].lookup_key for you.
  return (
    <Button onClick={() => showCheckout(user?.email)}>
      Upgrade
    </Button>
  );
}
```

`stripeProducts` are referenced by Stripe **lookup_key**, not a hard-coded price ID. The default `constants.json` ships one product:

```json
{
  "stripeProducts": [
    {
      "price": "$5.00",
      "title": "Unlimited",
      "interval": "month",
      "lookup_key": "my_lookup_key",
      "features": ["Unlimited Todos", "Unlimited Messages", "All Premium Features"]
    }
  ]
}
```

To open the Stripe customer portal for an existing subscriber, call `showManage(stripeID)` (posts `{ customerID }` to `POST /api/portal`). See [Stripe]({{ '/stripe' | relative_url }}) for the full setup, including the webhook endpoint `POST /api/payment`.

## Usage Tracking Example

The boilerplate's `ChatView` demonstrates freemium gating: free users get a usage limit (`FREE_USAGE_LIMIT`, default 20, over a rolling 30-day window), subscribers (`subscription.status === 'active'`) are unlimited (`remaining: -1`). Usage flows through `getRemainingUsage` / `trackUsage`, which call `POST /api/usage` with `{ operation: 'check' }` or `{ operation: 'track' }`.

```tsx
// src/components/UsageGatedAction.tsx
import { useState, useEffect, useRef } from 'react';
import type { ElementRef } from 'react';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import { getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { useUser } from '@stevederico/skateboard-ui/Context';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';

/** Usage snapshot returned by getRemainingUsage / trackUsage. */
interface UsageInfo {
  /** Remaining operations (-1 = unlimited) */
  remaining: number;
  /** Whether the user has an active subscription */
  isSubscriber: boolean;
}

export default function UsageGatedAction() {
  const user = useUser();
  const [usageInfo, setUsageInfo] = useState<UsageInfo>({ remaining: -1, isSubscriber: true });
  const upgradeSheetRef = useRef<ElementRef<typeof UpgradeSheet>>(null);

  useEffect(() => {
    getRemainingUsage('messages')
      .then(setUsageInfo)
      .catch(() => console.error("Couldn't load usage"));
  }, []);

  const handleAction = async () => {
    // Gate non-subscribers who hit the limit
    if (!usageInfo.isSubscriber && usageInfo.remaining <= 0) {
      showUpgradeSheet(upgradeSheetRef);
      return;
    }

    // Do the work, then record usage
    const updated = await trackUsage('messages');
    setUsageInfo(updated);
  };

  return (
    <>
      <Button onClick={handleAction}>
        Run action
        {!usageInfo.isSubscriber && usageInfo.remaining >= 0 && ` (${usageInfo.remaining} left)`}
      </Button>
      <UpgradeSheet ref={upgradeSheetRef} userEmail={user?.email} />
    </>
  );
}
```

When a free user exceeds the limit on `track`, the backend responds `429` with `{ error, remaining: 0, total, isSubscriber: false }`.

## API Integration Examples

### apiRequest

`apiRequest(endpoint, options)` is the standard way to call the backend. It auto-includes credentials, auto-adds the CSRF token on mutations (POST/PUT/DELETE), auto-redirects to `/signout` on 401, parses JSON, throws on error, and has a 30-second timeout. Endpoints are relative to `constants.backendURL` (the `/api` prefix is configured there).

```tsx
import { apiRequest } from '@stevederico/skateboard-ui/Utilities';

// GET the current user (GET /api/me)
const me = await apiRequest('/me');

// POST with a body — CSRF token added automatically
const project = await apiRequest('/projects', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Project' }),
});

// PUT /api/me — only `name` is whitelisted by the backend
await apiRequest('/me', {
  method: 'PUT',
  body: JSON.stringify({ name: 'Ada Lovelace' }),
});
```

### Context (current user)

Read the authenticated user and dispatch actions from the shell context.

```tsx
import { getState } from '@stevederico/skateboard-ui/Context';

function Profile() {
  const { state, dispatch } = getState();
  const user = state.user;

  if (!user) return null;

  return (
    <div>
      <h1 className="text-heading-lg">Welcome, {user.name}!</h1>
      <p className="text-copy-md text-muted-foreground">{user.email}</p>
      <button onClick={() => dispatch({ type: 'CLEAR_USER' })}>Sign out</button>
    </div>
  );
}
```

These examples reflect the real component, utility, and endpoint surface in Skateboard v3.4.0. Copy them into `src/components/` and adapt — the shell handles routing, auth, and theming so you can focus on views.
