import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const createSkateboardApp = vi.fn();

vi.mock('./assets/styles.css', () => ({}));

vi.mock('@stevederico/skateboard-ui/App', () => ({
  createSkateboardApp: (...args) => createSkateboardApp(...args)
}));

vi.mock('@stevederico/skateboard-ui/Layout', () => ({
  default: () => <div data-testid="layout">Layout</div>
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/spinner', () => ({
  Spinner: () => <div data-testid="spinner">Loading</div>
}));

vi.mock('./components/CommandMenu.jsx', () => ({
  default: () => <div data-testid="command-menu">Command Menu</div>
}));

vi.mock('./components/HomeView.jsx', () => ({
  default: () => <div data-testid="home-view">Home</div>
}));

vi.mock('./components/ChatView.jsx', () => ({
  default: () => <div data-testid="chat-view">Chat</div>
}));

vi.mock('./components/BlankView.jsx', () => ({
  default: ({ title }) => <div data-testid={`blank-${title.toLowerCase()}`}>{title}</div>
}));

vi.mock('./components/CalendarTestView.jsx', () => ({
  default: () => <div data-testid="calendar-test-view">Calendar</div>
}));

vi.mock('./constants.json', () => ({
  default: {
    appName: 'Test App',
    defaultRoute: 'home',
    pages: []
  }
}));

describe('main app bootstrap', () => {
  beforeEach(() => {
    createSkateboardApp.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes skateboard app with routes, constants, and layout override', async () => {
    const main = await import('./main.jsx');

    expect(createSkateboardApp).toHaveBeenCalledWith({
      constants: expect.objectContaining({ appName: 'Test App' }),
      appRoutes: expect.any(Array),
      defaultRoute: 'home',
      overrides: { layout: expect.any(Function) }
    });

    expect(main.appRoutes).toHaveLength(6);
  });

  it('registers six app routes including lazy home route', async () => {
    const { appRoutes } = await import('./main.jsx');
    const homeRoute = appRoutes.find((route) => route.path === 'home');

    expect(homeRoute?.element).toBeTruthy();
    expect(homeRoute.element.props.fallback).toBeTruthy();
  });
});

describe('AppLayout', () => {
  it('renders command menu and layout together', async () => {
    const { AppLayout } = await import('./main.jsx');
    render(<AppLayout />);

    expect(screen.getByTestId('command-menu')).toBeInTheDocument();
    expect(screen.getByTestId('layout')).toBeInTheDocument();
  });
});

describe('appRoutes', () => {
  it('defines expected route paths and elements', async () => {
    const { appRoutes } = await import('./main.jsx');
    const paths = appRoutes.map((route) => route.path);

    expect(paths).toEqual(['home', 'chat', 'analytics', 'projects', 'team', 'calendar-test']);
    expect(appRoutes.every((route) => route.element)).toBe(true);
  });

  it('wraps home route in suspense with spinner fallback', async () => {
    const { appRoutes } = await import('./main.jsx');
    const homeRoute = appRoutes.find((route) => route.path === 'home');
    render(homeRoute.element);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });
});