---
layout: default
title: Components
description: UI components library with Shadcn/ui and custom Skateboard components
---

# Components

Skateboard uses a combination of Shadcn/ui components and custom skateboard-ui components for a complete UI system.

## Component Library

### Skateboard UI Components

Custom components from `@stevederico/skateboard-ui`:

#### Layout Components

**Layout.jsx**
```jsx
import { Layout } from '@stevederico/skateboard-ui';

<Layout>
  <YourContent />
</Layout>
```

**AppSidebar.jsx**
```jsx
import { AppSidebar } from '@stevederico/skateboard-ui';

<AppSidebar />
```

**Header.jsx**
```jsx
import { Header } from '@stevederico/skateboard-ui';

<Header title="Page Title" />
```

**TabBar.jsx**
```jsx
import { TabBar } from '@stevederico/skateboard-ui';

<TabBar />
```

#### View Components

**LandingView.jsx**
```jsx
import { LandingView } from '@stevederico/skateboard-ui';

<LandingView />
```

**SignInView.jsx**
```jsx
import { SignInView } from '@stevederico/skateboard-ui';

<SignInView />
```

**SignUpView.jsx**
```jsx
import { SignUpView } from '@stevederico/skateboard-ui';

<SignUpView />
```

**SettingsView.jsx**
```jsx
import { SettingsView } from '@stevederico/skateboard-ui';

<SettingsView />
```

**StripeView.jsx**
```jsx
import { StripeView } from '@stevederico/skateboard-ui';

<StripeView />
```

**TextView.jsx**
```jsx
import { TextView } from '@stevederico/skateboard-ui';

<TextView 
  title="Privacy Policy"
  content="Your privacy policy content..."
/>
```

**NotFound.jsx**
```jsx
import { NotFound } from '@stevederico/skateboard-ui';

<NotFound />
```

#### Utility Components

**Sheet.jsx**
```jsx
import { Sheet } from '@stevederico/skateboard-ui';

<Sheet>
  <SheetContent>
    Your content here
  </SheetContent>
</Sheet>
```

### Shadcn/ui Components

Pre-built components in `skateboard-ui/shadcn/ui/`:

#### Button
```jsx
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';

<Button variant="default">Click me</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Ghost</Button>
```

#### Card
```jsx
import { Card, CardContent, CardHeader, CardTitle } from '@stevederico/skateboard-ui/shadcn/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
  </CardHeader>
  <CardContent>
    Card content here
  </CardContent>
</Card>
```

#### Input
```jsx
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';

<Input 
  type="email" 
  placeholder="Enter email" 
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
```

#### Label
```jsx
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';

<Label htmlFor="email">Email Address</Label>
```

#### Separator
```jsx
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';

<Separator className="my-4" />
```

#### Sidebar
```jsx
import { Sidebar, SidebarContent, SidebarGroup } from '@stevederico/skateboard-ui/shadcn/ui/sidebar';

<Sidebar>
  <SidebarContent>
    <SidebarGroup>
      Your sidebar content
    </SidebarGroup>
  </SidebarContent>
</Sidebar>
```

#### Skeleton
```jsx
import { Skeleton } from '@stevederico/skateboard-ui/shadcn/ui/skeleton';

<Skeleton className="h-4 w-full" />
```

#### Tooltip
```jsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@stevederico/skateboard-ui/shadcn/ui/tooltip';

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>Hover me</TooltipTrigger>
    <TooltipContent>
      <p>Tooltip content</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## Icons

### Lucide React Icons

```jsx
import { Home, Settings, User, Menu } from '@stevederico/skateboard-ui/lucide-react';

<Home className="h-5 w-5" />
<Settings className="h-5 w-5" />
<User className="h-5 w-5" />
<Menu className="h-5 w-5" />
```

## Custom Components

### Creating Custom Components

You can create custom components in your `src/components/` directory:

```jsx
// src/components/CustomCard.jsx
import { Card, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';

export function CustomCard({ title, children }) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}
```

### Styling Guidelines

#### Tailwind Classes

Use these utility classes for consistency:

```jsx
// Backgrounds
className="bg-background"      // Main background
className="bg-accent"          // Accent background
className="bg-muted"          // Muted background

// Text
className="text-foreground"    // Primary text
className="text-muted-foreground" // Secondary text

// Borders
className="border"             // Default border
className="border-border"      // Border color

// Spacing
className="p-4"               // Padding
className="m-4"               // Margin
className="space-y-4"         // Vertical spacing
```

#### Dark Mode Support

All components automatically support dark mode through CSS variables:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
}
```

## Component Patterns

### Loading States

```jsx
import { Skeleton } from '@stevederico/skateboard-ui/shadcn/ui/skeleton';

function MyComponent({ isLoading, data }) {
  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }
  
  return <div>{data}</div>;
}
```

### Error Boundaries

```jsx
function ErrorBoundary({ children }) {
  return (
    <div className="p-4 border border-red-200 rounded-lg bg-red-50">
      <h3 className="text-red-800">Something went wrong</h3>
      {children}
    </div>
  );
}
```

### Responsive Design

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Your content */}
</div>
```
