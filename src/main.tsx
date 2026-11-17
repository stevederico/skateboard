import './assets/styles.css';
import { lazy, Suspense } from 'react';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import type { AppRoute } from '@stevederico/skateboard-ui/App';
import Layout from '@stevederico/skateboard-ui/Layout';
import HomeViewSkeleton from './components/HomeViewSkeleton';
import constants from './constants.json';

const CommandMenu = lazy(() => import('./components/CommandMenu'));
const HomeView = lazy(() => import('./components/HomeView'));
const BlankView = lazy(() => import('./components/BlankView'));

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

export const appRoutes: AppRoute[] = [
  { path: 'home', element: <Suspense fallback={<HomeViewSkeleton />}><HomeView /></Suspense> },
  { path: 'analytics', element: <Suspense fallback={null}><BlankView title="Analytics" description="Analytics will appear here once you have activity." /></Suspense> },
  { path: 'projects', element: <Suspense fallback={null}><BlankView title="Projects" description="Create your first project to get started." /></Suspense> },
  { path: 'team', element: <Suspense fallback={null}><BlankView title="Team" description="Invite your first team member to start collaborating." /></Suspense> }
];

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home',
  overrides: { layout: AppLayout },
  loadLegal: () => import('./legal.json'),
});
