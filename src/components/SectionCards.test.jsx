import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionCards } from './SectionCards.jsx';

vi.mock('@stevederico/skateboard-ui/icons', () => ({
  TrendingUp: () => <span data-testid="trending-up" />,
  TrendingDown: () => <span data-testid="trending-down" />
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/badge', () => ({
  Badge: ({ children }) => <span data-testid="badge">{children}</span>
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/card', () => ({
  Card: ({ children, className }) => <div data-testid="card" className={className}>{children}</div>,
  CardAction: ({ children }) => <div>{children}</div>,
  CardDescription: ({ children }) => <p>{children}</p>,
  CardFooter: ({ children }) => <footer>{children}</footer>,
  CardHeader: ({ children }) => <header>{children}</header>,
  CardTitle: ({ children }) => <h3>{children}</h3>
}));

describe('SectionCards', () => {
  it('renders all metric cards', () => {
    render(<SectionCards />);

    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('$1,250.00')).toBeInTheDocument();
    expect(screen.getByText('New Customers')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('Active Accounts')).toBeInTheDocument();
    expect(screen.getByText('45,678')).toBeInTheDocument();
    expect(screen.getByText('Growth Rate')).toBeInTheDocument();
    expect(screen.getByText('4.5%')).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(4);
  });
});