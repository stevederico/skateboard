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
 * HomeView is lazy-loaded via React.lazy to code-split heavy dependencies
 * (recharts, @tanstack/react-table, @dnd-kit, zod) out of the initial bundle.
 *
 * @see {@link https://github.com/stevederico/skateboard|Skateboard Docs}
 */
import './assets/styles.css';
import { lazy, Suspense } from 'react';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import { Spinner } from '@stevederico/skateboard-ui/shadcn/ui/spinner';
import Layout from '@stevederico/skateboard-ui/Layout';
import CommandMenu from './components/CommandMenu.jsx';
import constants from './constants.json';
const HomeView = lazy(() => import('./components/HomeView.jsx'));
import ChatView from './components/ChatView.jsx';
import BlankView from './components/BlankView.jsx';

/**
 * App layout with global command menu overlay.
 *
 * Wraps the default skateboard-ui Layout and injects CommandMenu
 * so the Cmd+K shortcut is available on all authenticated routes.
 *
 * @returns {JSX.Element} Layout with command menu
 */
function AppLayout() {
  return (
    <>
      <CommandMenu />
      <Layout />
    </>
  );
}

/**
 * Application route configuration
 *
 * Maps route paths to view components. Routes are relative to root (no leading slash).
 * The shell handles route registration, navigation, and layout.
 *
 * @type {Array<{path: string, element: JSX.Element}>}
 */
const appRoutes = [
  { path: 'home', element: <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Spinner /></div>}><HomeView /></Suspense> },
  { path: 'chat', element: <ChatView /> },
  { path: 'analytics', element: <BlankView title="Analytics" description="Analytics will appear here once you have activity." buttonTitle="View Reports" /> },
  { path: 'projects', element: <BlankView title="Projects" description="Create your first project to get started." buttonTitle="Create Project" /> },
  { path: 'team', element: <BlankView title="Team" description="Invite your first team member to start collaborating." buttonTitle="Invite Member" /> }
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
 * @param {Object} config - App configuration
 * @param {Object} config.constants - App constants from constants.json
 * @param {Array} config.appRoutes - Route configuration array
 * @param {string} config.defaultRoute - Initial route path
 */
createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home',
  overrides: { layout: AppLayout }
});

/** Preload HomeView chunk after initial render for instant navigation */
setTimeout(() => import('./components/HomeView.jsx'), 2000);
