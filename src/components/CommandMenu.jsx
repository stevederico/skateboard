import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getState } from '@stevederico/skateboard-ui/Context';
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@stevederico/skateboard-ui/shadcn/ui/command';
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';

/**
 * Global command menu activated via Cmd+K (Mac) or Ctrl+K (Windows).
 *
 * Renders a searchable command palette overlay that lists all app pages
 * from constants.json. Selecting a page navigates to its route under /app/.
 *
 * Uses cmdk under the hood via skateboard-ui's Command primitives.
 * The keyboard listener is global, so this component works regardless
 * of which route is currently active.
 *
 * @component
 * @returns {JSX.Element} Command dialog with page navigation
 *
 * @example
 * // Add to any layout or view — keyboard shortcut is global
 * <CommandMenu />
 */
export default function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { state } = getState();
  const pages = state.constants?.pages || [];

  useEffect(() => {
    /**
     * Toggle command menu on Cmd+K / Ctrl+K keydown.
     * @param {KeyboardEvent} e - Native keyboard event
     */
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * Navigate to the selected page and close the menu.
   * @param {string} url - Route path relative to /app/
   */
  const handleSelect = useCallback(
    (url) => {
      navigate(`/app/${url}`);
      setOpen(false);
    },
    [navigate]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Menu"
      description="Search and navigate to any page"
    >
      <Command className="rounded-lg">
        <CommandInput placeholder="Search pages..." />
        <CommandList className="p-2">
          <CommandEmpty>No pages found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {pages.map((page) => (
              <CommandItem
                key={page.url}
                value={page.title}
                onSelect={() => handleSelect(page.url)}
                className="gap-3 px-3 py-2.5"
              >
                <DynamicIcon name={page.icon} size={16} className="shrink-0 text-muted-foreground" />
                <span>{page.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
