# Composition Rules

## Card Pattern

Cards are the primary content container. Always use the full structure:

```jsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Optional description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Main content */}
  </CardContent>
  <CardFooter>
    {/* Actions */}
  </CardFooter>
</Card>
```

**Rules:**
- Always include `CardHeader` with `CardTitle`
- `CardDescription` is optional but recommended
- `CardFooter` for actions — buttons align right with `justify-end`
- Never put raw content directly inside `<Card>` without `CardContent`
- Use `gap-4` inside `CardContent` for vertical spacing

## Dialog Pattern

Dialogs are for focused tasks requiring user attention:

```jsx
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

**Rules:**
- `DialogDescription` is required for accessibility (screen readers)
- Always provide a Cancel action
- Destructive actions use `<Button variant="destructive">`
- Use `AlertDialog` for destructive confirmations (not `Dialog`)

## Form Pattern

Forms combine `Field`, `Label`, `Input`, and validation:

```jsx
<form onSubmit={handleSubmit} className="flex flex-col gap-4">
  <Field>
    <Label htmlFor="name">Name</Label>
    <Input id="name" value={name} onChange={e => setName(e.target.value)} />
  </Field>
  <Field>
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
  </Field>
  <Button type="submit">Save</Button>
</form>
```

**Rules:**
- Every `Input` must have a paired `Label` with matching `htmlFor`/`id`
- Use `Field` to wrap label+input pairs (handles spacing and error states)
- Use `gap-4` on the form element — never margin between fields
- Submit button is last, outside any `Field` wrapper
- See [forms.md](forms.md) for validation patterns

## Sheet Pattern

Sheets are for supplementary content that slides in from the edge:

```jsx
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

**Rules:**
- Use Sheet for detail panels, filters, settings
- Use Dialog for focused actions requiring a decision
- Use Drawer for mobile-first bottom panels

## Layout Composition

### Page Layout
```jsx
<main className="flex flex-col gap-6 p-6">
  <header className="flex items-center justify-between">
    <h1 className="text-heading-lg">Page Title</h1>
    <Button>Action</Button>
  </header>
  <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    {/* Content grid */}
  </section>
</main>
```

### Nesting Rules
- Max 3 levels of component nesting (e.g., Card > Form > Field)
- Flat is better than deep — avoid wrapping in unnecessary containers
- Use `flex` + `gap` for linear layouts, `grid` + `gap` for 2D layouts
- Never nest Cards inside Cards
- Never nest Dialogs inside Dialogs
