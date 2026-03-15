# View & Page Patterns

## View Structure

Every view (page component) follows this structure:

```jsx
export default function DashboardView() {
  const { data, loading, error, refetch } = useListData("/endpoint");

  if (loading) return <ViewSkeleton />;
  if (error) return <ViewError message={error} onRetry={refetch} />;

  return (
    <main className="flex flex-col gap-6 p-6">
      <ViewHeader title="Dashboard" action={<Button>New Item</Button>} />
      <section>{/* Content */}</section>
    </main>
  );
}
```

## View Header

Every view starts with a header containing the page title and optional action:

```jsx
function ViewHeader({ title, description, action }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-heading-lg">{title}</h1>
        {description && (
          <p className="text-copy-md text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}
```

**Rules:**
- Title is always `text-heading-lg`
- Description is `text-copy-md text-muted-foreground`
- Action button aligns right
- No breadcrumbs — the sidebar provides navigation context

## Data Fetching

Use `useListData` from skateboard-ui for all data fetching:

```jsx
import { useListData } from "@stevederico/skateboard-ui/Utilities";

const { data, loading, error, refetch } = useListData("/deals");
```

**Rules:**
- Always handle all three states: `loading`, `error`, `data`
- Show `<Skeleton>` components during loading — match the layout shape
- Show `<Empty>` component when `data` is an empty array
- Show error state with retry action on failure
- Never fetch in `useEffect` directly — use `useListData`

## Loading States

Match the skeleton to the content layout:

```jsx
function ViewSkeleton() {
  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </main>
  );
}
```

## Empty States

Every list/grid view needs an empty state:

```jsx
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@stevederico/skateboard-ui/shadcn/ui/empty";

{data.length === 0 ? (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <IconFolder size={24} />
      </EmptyMedia>
      <EmptyTitle>No projects yet</EmptyTitle>
      <EmptyDescription>Create your first project to get started.</EmptyDescription>
    </EmptyHeader>
    <Button onClick={handleCreate}>Create Project</Button>
  </Empty>
) : (
  <div className="grid gap-4 md:grid-cols-3">
    {data.map(item => <ProjectCard key={item.id} {...item} />)}
  </div>
)}
```

## Error States

```jsx
function ViewError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12">
      <IconAlertTriangle size={48} className="text-destructive" />
      <p className="text-copy-md text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}
```

## Layout Patterns

### List View
```jsx
<main className="flex flex-col gap-6 p-6">
  <ViewHeader title="Projects" action={<Button>New</Button>} />
  <div className="flex flex-col gap-3">
    {data.map(item => <Item key={item.id} {...item} />)}
  </div>
</main>
```

### Grid View
```jsx
<main className="flex flex-col gap-6 p-6">
  <ViewHeader title="Projects" />
  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    {data.map(item => <ProjectCard key={item.id} {...item} />)}
  </div>
</main>
```

### Detail View
```jsx
<main className="flex flex-col gap-6 p-6 max-w-2xl">
  <ViewHeader title={item.name} />
  <Card>
    <CardContent className="flex flex-col gap-4 pt-6">
      {/* Detail fields */}
    </CardContent>
  </Card>
</main>
```

### Settings View
```jsx
<main className="flex flex-col gap-6 p-6 max-w-2xl">
  <ViewHeader title="Settings" />
  <form onSubmit={handleSubmit} className="flex flex-col gap-6">
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>...</Field>
        <Field>...</Field>
      </CardContent>
    </Card>
    <Button type="submit" className="self-end">Save</Button>
  </form>
</main>
```
