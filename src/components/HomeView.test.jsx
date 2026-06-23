import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomeView from './HomeView.jsx';

vi.mock('@stevederico/skateboard-ui/Header', () => ({
  default: ({ title }) => <header data-testid="header">{title}</header>
}));

vi.mock('./SectionCards.jsx', () => ({
  SectionCards: () => <div data-testid="section-cards">Section Cards</div>
}));

describe('HomeView', () => {
  it('renders dashboard header and section cards', () => {
    render(<HomeView />);

    expect(screen.getByTestId('header')).toHaveTextContent('Documents');
    expect(screen.getByTestId('section-cards')).toBeInTheDocument();
  });
});