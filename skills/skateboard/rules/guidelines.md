# Top 30 Web Interface Guidelines

## Layout & Structure

1. **Single-column for content, multi-column for dashboards** — Content pages (articles, forms, settings) are single-column. Dashboards and data views use grid layouts.

2. **Max content width: 672px (prose), 1280px (app)** — Prose content caps at `max-w-2xl`. App layouts cap at `max-w-7xl`. Never let text run full viewport width.

3. **Consistent spacing rhythm** — Use the 4px grid: `gap-2` (8px), `gap-4` (16px), `gap-6` (24px), `gap-8` (32px). Don't mix arbitrary spacing values.

4. **Visual hierarchy through size, not color** — Establish importance with heading sizes and font weight, not with color variety. Limit to 2-3 font sizes per view.

## Touch & Interaction

5. **Minimum touch target: 44×44px** — All clickable elements must be at least 44px in both dimensions. Use padding to expand small elements to meet this.

6. **Clickable area exceeds visual area** — Buttons and links should have padding beyond their visible bounds. Users shouldn't need pixel-perfect aim.

7. **Hover states on everything interactive** — Every clickable element needs a visible hover state. Use `hover:bg-accent` for subtle feedback.

8. **Active/pressed states** — Buttons need `active:scale-[0.98]` or similar feedback so users know their click registered.

## Typography

9. **Two font weights maximum** — Use `font-normal` (400) for body, `font-semibold` (600) for emphasis. Never use `font-bold` (700) in body text.

10. **Line height: 1.5 for body, 1.2 for headings** — Body text (`leading-normal`) needs generous line height. Headings (`leading-tight`) can be tighter.

11. **Paragraph width: 45-75 characters** — Optimal reading width. Use `max-w-prose` or `max-w-2xl` to constrain text blocks.

12. **Don't center-align body text** — Center alignment is for headings and short labels only. Body text is always left-aligned.

## Color & Contrast

13. **WCAG AA minimum: 4.5:1 for text, 3:1 for large text** — Test every text/background combo. Use semantic tokens that are pre-tested.

14. **Never convey meaning with color alone** — Pair color with icons, text labels, or patterns. Red dot alone is not enough — add "Error" text.

15. **Muted palette, vibrant accents** — Background and text use neutral tones. Color is reserved for actions, status, and brand. One accent color per view.

## Animation & Motion

16. **Transitions: 150ms for micro, 300ms for layout** — Button hovers and toggles: `duration-150`. Panel slides and page transitions: `duration-300`.

17. **Ease-out for entrances, ease-in for exits** — Elements entering view decelerate (`ease-out`). Elements leaving accelerate (`ease-in`).

18. **Respect prefers-reduced-motion** — Wrap animations in `motion-safe:` or check the media query. Some users get motion sick.

19. **No animation on first paint** — Page load should not trigger animations. Animate only on user interaction or data changes.

## Feedback & State

20. **Loading state within 200ms** — If an action takes more than 200ms, show a spinner or skeleton. Never leave the user guessing.

21. **Optimistic UI for fast actions** — Toggle switches, likes, and bookmarks update instantly. Roll back on error.

22. **Error messages next to the problem** — Form errors below the field. API errors in a toast. Never at the top of the page in a banner that scrolls away.

23. **Success confirmation for destructive actions** — After deleting, show a toast with "Undo" option. Don't just silently remove the item.

## Accessibility

24. **Keyboard navigation for everything** — Tab through all interactive elements. Enter/Space to activate. Escape to close. Arrow keys in menus.

25. **Focus indicators are mandatory** — Never `outline-none` without a replacement. Use `focus-visible:ring-2 ring-ring` for consistent focus rings.

26. **Skip-to-content link** — First focusable element should be a skip link: `<a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>`

27. **Announce dynamic changes** — Use `aria-live="polite"` for content updates. Use `role="alert"` for errors. Screen readers need to know when things change.

## Data Display

28. **Empty states are first-class UI** — Every list/table needs an empty state with an icon, message, and call-to-action. Never show a blank area.

29. **Pagination or infinite scroll — never both** — Pick one. Pagination for data tables, infinite scroll for feeds. Show total count.

30. **Truncate with intention** — Long text gets `line-clamp-2` or `truncate` with a tooltip or expand action. Never let text overflow its container.

## Copywriting

31. **Active voice, not passive** — "Save your changes" not "Changes will be saved." Direct, clear, action-oriented.

32. **Title Case for headings and buttons** — "Create New Project", "Save Changes". Sentence case for body text and descriptions.

33. **Error messages guide the exit** — Don't just say what went wrong. Say what to do: "Email is required" not "Invalid input". "Check your connection and try again" not "Network error".

## Typography Polish

34. **Curly quotes, not straight quotes** — Use `"` `"` `'` `'` in user-facing text, not `"` `'`. Especially in marketing copy and headings.

35. **Tabular numbers for comparisons** — Use `font-variant-numeric: tabular-nums` (Tailwind: `tabular-nums`) on prices, stats, table columns. Numbers should align vertically.

36. **Non-breaking spaces before units** — Use `&nbsp;` between numbers and units (`100&nbsp;MB`, `$5.00&nbsp;/mo`) to prevent awkward line breaks.

37. **Optical alignment** — Adjust ±1px when perception beats geometry. Icons next to text may need visual nudging even when technically aligned.

## Performance

38. **Mutations under 500ms** — POST, PATCH, DELETE operations must complete within 500ms. If they can't, show progress and allow cancellation.

39. **Virtualize large lists** — Any list over 100 items should use virtualization (windowing). Never render 1000 DOM nodes for a scrollable list.

40. **No layout shift on load** — Reserve space for images, embeds, and async content with aspect-ratio or fixed dimensions. CLS score matters.
