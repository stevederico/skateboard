import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandMenu from './CommandMenu.jsx';

const navigate = vi.fn();
const pages = [
  { title: 'Dashboard', url: 'home', icon: 'layout-dashboard' },
  { title: 'Analytics', url: 'analytics', icon: 'chart-bar' }
];
let contextState = { constants: { pages } };

vi.mock('react-router', () => ({
  useNavigate: () => navigate
}));

vi.mock('@stevederico/skateboard-ui/Context', () => ({
  getState: () => ({ state: contextState })
}));

vi.mock('@stevederico/skateboard-ui/DynamicIcon', () => ({
  default: ({ name }) => <span data-testid={`icon-${name}`} />
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/command', () => ({
  Command: ({ children }) => <div data-testid="command">{children}</div>,
  CommandDialog: ({ open, children, onOpenChange }) => (
    <div data-testid="command-dialog" data-open={open}>
      <button type="button" onClick={() => onOpenChange(true)}>open</button>
      {open ? children : null}
    </div>
  ),
  CommandInput: (props) => <input data-testid="command-input" {...props} />,
  CommandList: ({ children }) => <div>{children}</div>,
  CommandEmpty: () => <div>No pages found.</div>,
  CommandGroup: ({ children }) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }) => (
    <button type="button" onClick={() => onSelect()}>{children}</button>
  ),
  CommandShortcut: ({ children }) => <span>{children}</span>
}));

describe('CommandMenu', () => {
  beforeEach(() => {
    navigate.mockReset();
    contextState = { constants: { pages } };
  });

  it('toggles open on Cmd+K keyboard shortcut', () => {
    render(<CommandMenu />);

    expect(screen.getByTestId('command-dialog')).toHaveAttribute('data-open', 'false');

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByTestId('command-dialog')).toHaveAttribute('data-open', 'true');

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByTestId('command-dialog')).toHaveAttribute('data-open', 'false');
  });

  it('toggles open on Ctrl+K keyboard shortcut', () => {
    render(<CommandMenu />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('command-dialog')).toHaveAttribute('data-open', 'true');
  });

  it('navigates to selected page and closes the menu', () => {
    render(<CommandMenu />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    fireEvent.click(screen.getByRole('button', { name: /Dashboard/i }));

    expect(navigate).toHaveBeenCalledWith('/app/home');
    expect(screen.getByTestId('command-dialog')).toHaveAttribute('data-open', 'false');
  });

  it('renders pages from constants state', () => {
    render(<CommandMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('renders empty pages list when constants pages are missing', () => {
    contextState = {};
    render(<CommandMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));

    expect(screen.getByText('No pages found.')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});