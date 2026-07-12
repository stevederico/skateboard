import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomeViewSkeleton from './HomeViewSkeleton';

vi.mock('@stevederico/skateboard-ui/ui/skeleton', () => ({
  Skeleton: ({ className }) => <div data-testid="skeleton" className={className} />,
}));

describe('HomeViewSkeleton', () => {
  it('renders dashboard-shaped skeleton placeholders', () => {
    render(<HomeViewSkeleton />);

    expect(screen.getByRole('generic', { busy: true })).toBeInTheDocument();
    // Header bar + 4 cards × 3 lines each = 1 + 12 = 13 skeletons
    expect(screen.getAllByTestId('skeleton')).toHaveLength(13);
  });
});
