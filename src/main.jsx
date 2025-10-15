import './assets/styles.css';
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import { initializeUtilities } from '@stevederico/skateboard-ui/Utilities';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';
import ChatView from './components/ChatView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> },
  { path: 'chat', element: <ChatView /> }
];

initializeUtilities(constants);

createSkateboardApp({
  constants,
  appRoutes,
  defaultRoute: 'home'
});
