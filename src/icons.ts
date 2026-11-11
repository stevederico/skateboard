/**
 * App icon funnel: the ONE module allowed to import `lucide-react`.
 *
 * Components import icons from here (`import { Plus } from '../icons'`), never from
 * `lucide-react` directly; `npm run lint` enforces it (skateboard/icons-through-funnel).
 * The explicit, named list keeps the icon set auditable (this file is every icon the
 * app ships), tree-shakeable (no `export *`), and swappable (replace an entry with a
 * vendored SVG component here, renaming the file to icons.tsx, and no caller changes).
 *
 * To use a new icon: add its Lucide name below, then import it from this module.
 * constants.json icon strings (pages, features, appIcon) are resolved by the shell and
 * do not need entries here.
 */
export { LayoutDashboard, Plus, TrendingDown, TrendingUp } from 'lucide-react';
