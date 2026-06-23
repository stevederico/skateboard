import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CalendarTestView from './CalendarTestView.jsx';

vi.mock('@stevederico/skateboard-ui/Header', () => ({
  default: ({ title }) => <header data-testid="header">{title}</header>
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/card', () => ({
  Card: ({ children }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }) => <header>{children}</header>,
  CardTitle: ({ children }) => <h2>{children}</h2>,
  CardDescription: ({ children }) => <p data-testid="card-description">{children}</p>,
  CardContent: ({ children }) => <div>{children}</div>
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/calendar', () => ({
  Calendar: ({ mode, selected, onSelect, disabled, captionLayout }) => {
    const variant = disabled?.length ? 'disabled' : (captionLayout || 'default');
    const id = `${mode}-${variant}`;
    return (
      <div data-testid={`calendar-${id}`}>
        <button
          type="button"
          data-testid={`select-${id}`}
          onClick={() => onSelect?.(
            mode === 'range'
              ? { from: new Date(2026, 5, 15), to: new Date(2026, 5, 20) }
              : new Date(2026, 5, 15)
          )}
        >
          select
        </button>
        <button
          type="button"
          data-testid={`clear-${id}`}
          onClick={() => onSelect?.(mode === 'range' ? {} : undefined)}
        >
          clear
        </button>
        <span data-testid={`selected-${id}`}>
          {selected?.toLocaleDateString?.() || selected?.from?.toLocaleDateString?.() || 'none'}
        </span>
        <span data-testid={`disabled-count-${id}`}>{disabled?.length ?? 0}</span>
      </div>
    );
  }
}));

describe('CalendarTestView', () => {
  it('renders calendar QA header and mode sections', () => {
    render(<CalendarTestView />);

    expect(screen.getByTestId('header')).toHaveTextContent('Calendar QA');
    expect(screen.getByText('mode="single"')).toBeInTheDocument();
    expect(screen.getByText('mode="range"')).toBeInTheDocument();
    expect(screen.getByText('captionLayout="dropdown"')).toBeInTheDocument();
    expect(screen.getByText(/disabled = \[tomorrow/)).toBeInTheDocument();
    expect(screen.getByText('Keyboard QA checklist')).toBeInTheDocument();
  });

  it('updates single date selection', () => {
    render(<CalendarTestView />);

    fireEvent.click(screen.getByTestId('select-single-default'));

    expect(screen.getByTestId('selected-single-default')).toHaveTextContent('6/15/2026');
  });

  it('updates range date selection', () => {
    render(<CalendarTestView />);

    fireEvent.click(screen.getByTestId('select-range-default'));

    expect(screen.getByTestId('selected-range-default')).toHaveTextContent('6/15/2026');
  });

  it('updates dropdown calendar selection', () => {
    render(<CalendarTestView />);

    fireEvent.click(screen.getByTestId('select-single-dropdown'));

    expect(screen.getByTestId('selected-single-dropdown')).toHaveTextContent('6/15/2026');
  });

  it('passes disabled dates to calendar', () => {
    render(<CalendarTestView />);

    expect(screen.getByTestId('disabled-count-single-disabled')).toHaveTextContent('2');
  });

  it('shows none when single and range selections are cleared', () => {
    render(<CalendarTestView />);

    fireEvent.click(screen.getByTestId('clear-single-default'));
    fireEvent.click(screen.getByTestId('clear-range-default'));

    expect(screen.getByTestId('selected-single-default')).toHaveTextContent('none');
    expect(screen.getByTestId('selected-range-default')).toHaveTextContent('none');
    expect(screen.getByText(/From: \(none\)/)).toBeInTheDocument();
    expect(screen.getByText(/To: \(none\)/)).toBeInTheDocument();
  });
});