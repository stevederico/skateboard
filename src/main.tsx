/**
 * Application entry point using Skateboard Application Shell Architecture
 *
 * Configures routing and initializes app with skateboard-ui framework.
 * The shell (skateboard-ui) provides:
 * - Routing system with React Router v7
 * - Context/state management
 * - Authentication flow
 * - Common UI components (Header, Footer, UpgradeSheet)
 * - Utility functions (apiRequest, usage tracking)
 *
 * This file only defines:
 * - Custom view components
 * - Route configuration
 * - App constants
 *
 * @see {@link https://github.com/stevederico/skateboard|Skateboard Docs}
 */
import './assets/styles.css';
import { lazy, Suspense } from 'react';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import type { AppRoute } from '@stevederico/skateboard-ui/App';
import Layout from '@stevederico/skateboard-ui/Layout';
import HomeViewSkeleton from './components/HomeViewSkeleton';
import constants from './constants.json';

// Route-level code splitting: the command palette and each view leave the entry chunk.
const CommandMenu = lazy(() => import('./components/CommandMenu'));
const HomeView = lazy(() => import('./components/HomeView'));
const BlankView = lazy(() => import('./components/BlankView'));

/**
 * App layout with global command menu overlay.
 *
 * Wraps the default skateboard-ui Layout and injects CommandMenu
 * so the Cmd+K shortcut is available on all authenticated routes.
 *
 * @returns Layout with command menu
 */
export function AppLayout() {
  return (
    <>
      <Suspense fallback={null}>
        <CommandMenu />
      </Suspense>
      <Layout />
    </>
  );
}

/**
 * Application route configuration
 *
 * Maps route paths to view components. Routes are relative to root (no leading slash).
 * The shell handles route registration, navigation, and layout.
 */
export const appRoutes: AppRoute[] = [
  { path: 'home', element: <Suspense fallback={<HomeViewSkeleton />}><HomeView /></Suspense> },
  { path: 'analytics', element: <Suspense fallback={null}><BlankView title="Analytics" description="Analytics will appear here once you have activity." /></Suspense> },
  { path: 'projects', element: <Suspense fallback={null}><BlankView title="Projects" description="Create your first project to get started." /></Suspense> },
  { path: 'team', element: <Suspense fallback={null}><BlankView title="Team" description="Invite your first team member to start collaborating." /></Suspense> }
];

/**
 * Initialize and mount Skateboard app
 *
 * Creates React root, configures router, initializes context/state,
 * and renders app shell. Automatically handles:
 * - User authentication state
 * - Protected routes
 * - Navigation setup
 * - Footer with app info
 *
 * @param config - App configuration
 * @param config.constants - App constants from constants.json
 * @param config.appRoutes - Route configuration array
 * @param config.defaultRoute - Initial route path
 */
createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home',
  overrides: { layout: AppLayout }
});
