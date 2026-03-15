# Form Rules

## Label + Input Pairing

Every input MUST have a label. No exceptions.

```jsx
{/* Correct */}
<Field>
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" placeholder="you@example.com" />
</Field>

{/* Wrong — no label */}
<Input placeholder="Enter email..." />

{/* Wrong — no htmlFor/id link */}
<Label>Email</Label>
<Input placeholder="Enter email..." />
```

## Field Component

Use `<Field>` to wrap every label+input pair:

```jsx
<Field>
  <Label htmlFor="name">Full Name</Label>
  <Input id="name" />
  {error && <p className="text-sm text-destructive">{error}</p>}
</Field>
```

`Field` provides consistent spacing and error state layout.

## Validation Pattern

Handle validation inline with clear, human-readable messages:

```jsx
const [errors, setErrors] = useState({});

function validate(data) {
  const errs = {};
  if (!data.name) errs.name = "Name is required";
  if (!data.email) errs.email = "Email is required";
  if (data.email && !data.email.includes("@")) errs.email = "Enter a valid email";
  return errs;
}

function handleSubmit(e) {
  e.preventDefault();
  const errs = validate(formData);
  if (Object.keys(errs).length) {
    setErrors(errs);
    return;
  }
  // submit
}
```

**Rules:**
- Validate on submit, not on every keystroke
- Show errors below the field, not in alerts or toasts
- Use `text-destructive` for error text
- Clear field errors when the user starts typing in that field

## Option Selection

Use the right component for the number of options:

| Options | Component | Example |
|---------|-----------|---------|
| 2-4 visible choices | `<ToggleGroup>` | Plan tier, view mode |
| 5+ choices | `<Select>` | Country, timezone |
| Yes/No toggle | `<Switch>` | Enable notifications |
| Multiple selections | `<Checkbox>` group | Feature flags |

### ToggleGroup for Options

Prefer `ToggleGroup` over radio buttons for small option sets:

```jsx
<Field>
  <Label>Plan</Label>
  <ToggleGroup type="single" value={plan} onValueChange={setPlan}>
    <ToggleGroupItem value="free">Free</ToggleGroupItem>
    <ToggleGroupItem value="pro">Pro</ToggleGroupItem>
    <ToggleGroupItem value="team">Team</ToggleGroupItem>
  </ToggleGroup>
</Field>
```

## Form Layout

```jsx
<form onSubmit={handleSubmit} className="flex flex-col gap-4">
  {/* Fields */}
  <Field>...</Field>
  <Field>...</Field>

  {/* Actions — always at bottom */}
  <div className="flex justify-end gap-2">
    <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
    <Button type="submit" disabled={isSubmitting}>
      {isSubmitting ? <Spinner className="size-4" /> : "Save"}
    </Button>
  </div>
</form>
```

**Rules:**
- Form uses `flex flex-col gap-4`
- Actions grouped at bottom with `justify-end gap-2`
- Cancel is `variant="outline"`, Submit is default
- Disable submit button during submission
- Show `<Spinner>` inside button during loading — never replace button text with "Loading..."
