import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlankView from './BlankView.jsx';

vi.mock('@stevederico/skateboard-ui/Header', () => ({
  default: ({ title }) => <header data-testid="header">{title}</header>
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/button', () => ({
  Button: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/empty', () => ({
  Empty: ({ children }) => <div data-testid="empty">{children}</div>,
  EmptyHeader: ({ children }) => <div>{children}</div>,
  EmptyMedia: ({ children }) => <div>{children}</div>,
  EmptyTitle: ({ children }) => <h2>{children}</h2>,
  EmptyDescription: ({ children }) => <p>{children}</p>
}));

vi.mock('@stevederico/skateboard-ui/icons', () => ({
  LayoutDashboard: () => <span data-testid="default-icon" />,
  Plus: () => <span data-testid="plus-icon" />
}));

describe('BlankView', () => {
  it('renders header title and empty state with defaults', () => {
    render(<BlankView title="Projects" />);

    expect(screen.getByTestId('header')).toHaveTextContent('Projects');
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText('Projects will appear here once you get started.')).toBeInTheDocument();
    expect(screen.getByTestId('default-icon')).toBeInTheDocument();
  });

  it('renders custom description, button, and icon', () => {
    const onButtonClick = vi.fn();
    render(
      <BlankView
        title="Team"
        description="Invite collaborators to get started."
        buttonTitle="Invite Member"
        onButtonClick={onButtonClick}
        icon={<span data-testid="custom-icon" />}
      />
    );

    expect(screen.getByText('Invite collaborators to get started.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invite Member/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Invite Member/i }));
    expect(onButtonClick).toHaveBeenCalledOnce();
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders no CTA button when buttonTitle is empty', () => {
    const { container } = render(<BlankView title="Projects" buttonTitle="" />);

    // Behavioral guard: an empty buttonTitle shows the empty state with no CTA.
    // (This does not distinguish the `&&` vs ternary fix — for "" both render no
    // <button>; the ternary's only gain is returning null over an empty text node.)
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="plus-icon"]')).toBeNull();
  });

  it('renders children instead of empty state when provided', () => {
    render(
      <BlankView title="Analytics">
        <div data-testid="custom-content">Custom analytics content</div>
      </BlankView>
    );

    expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    expect(screen.queryByTestId('empty')).not.toBeInTheDocument();
  });
});