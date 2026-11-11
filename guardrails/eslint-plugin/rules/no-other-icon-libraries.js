import { createBannedImportRule } from '../lib/bannedImports.js';

/** Icon packages other than Lucide. Scoped families match every package in the scope. */
const ICON_PACKAGES = new Set(['react-icons', '@tabler/icons-react', '@tabler/icons', '@heroicons/react', '@radix-ui/react-icons', 'react-feather', 'phosphor-react', '@mui/icons-material', 'ionicons', 'bootstrap-icons', 'feather-icons']);
const ICON_SCOPES = ['@fortawesome/', '@phosphor-icons/', '@iconify/', '@iconify-icons/'];

export default createBannedImportRule({
  description: "Don't use Tabler, Heroicons, or Font Awesome: Lucide only. Don't mix icon libraries in the same project.",
  source: 'skills/skateboard/rules/icons.md > Don\'t',
  entries: [
    {
      match: (source, pkg) => ICON_PACKAGES.has(pkg) || ICON_SCOPES.some((scope) => source.startsWith(scope)),
      why:
        'mixed icon sets look inconsistent (stroke width, grid, corner style), and every extra library adds bundle weight. skateboard-ui renders Lucide for constants.json icons, so Lucide is the one set that matches the shell.',
      fix:
        'find the Lucide equivalent at https://lucide.dev/icons, add it to the explicit export list in src/icons.ts (`export { Plus, Trash2 } from "lucide-react";`), and import it from the funnel (`import { Plus } from "../icons";`).',
    },
  ],
});
