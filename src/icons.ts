/**
 * App icon funnel: the ONE module allowed to import `@stevederico/skateboard-ui/icons`.
 *
 * skateboard-ui (5.13+) vendors the Lucide icons the shell and the skateboard apps use,
 * so the app needs no `lucide-react` dependency. Components import icons from here
 * (`import { Plus } from '../icons'`), never from the package directly; `npm run lint`
 * enforces it (skateboard/icons-through-funnel). The explicit, named list keeps the icon
 * set auditable (this file is every icon the app ships), tree-shakeable (no `export *`),
 * and swappable (replace an entry with a local SVG component here, renaming the file to
 * icons.tsx, and no caller changes).
 *
 * To use a new icon: add its Lucide name below, then import it from this module. If
 * skateboard-ui does not export it, the typecheck fails; add a local SVG component here.
 * constants.json icon strings (pages, features, appIcon) are resolved by the shell and
 * do not need entries here.
 */
export { LayoutDashboard, Plus, TrendingDown, TrendingUp } from '@stevederico/skateboard-ui/icons';
