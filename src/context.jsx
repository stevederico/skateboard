import React, { createContext, useContext, useReducer } from 'react';
import pkg from '../package.json';
const context = createContext();
import constants from './constants.json';

function setupConstants() {
  try {
    const c = { ...constants };
    // Client-side only operations
    if (typeof window !== 'undefined') {
      document.title = c.appName;
    }
    c.version = pkg.version;
    return c;
  } catch (e) {
    console.error('Failed to setup constants:', e);
    return constants;
  }
}

// Initialize state with SSR safety - prevent localStorage access on server
function getInitialState(serverState = {}) {
  // Base state
  const baseState = {
    constants: setupConstants(),
    user: null,
    theme: 'light',
    ...serverState
  };
  
  // Client-side only state initialization
  if (typeof window !== 'undefined') {
    try {
      // Only access localStorage on the client
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          baseState.user = JSON.parse(storedUser);
        } catch (e) {
          console.error('Failed to parse user data:', e);
        }
      }
      
      baseState.theme = localStorage.getItem('theme') || 'light';
    } catch (e) {
      console.error('Failed to load local state:', e);
    }
  }
  
  return baseState;
}

function reducer(state, action) {
  try {
    switch (action.type) {
      case 'SET_USER':
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(action.payload));
        }
        return { ...state, user: action.payload };
      case 'SET_THEME':
        if (typeof window !== 'undefined') {
          localStorage.setItem('theme', action.payload);
        }
        return { ...state, theme: action.payload };
      case 'CLEAR_USER':
        if (typeof window !== 'undefined') {
          localStorage.removeItem('user');
        }
        return { ...state, user: null };
      default:
        return state;
    }
  } catch (e) {
    console.error('Reducer error:', e);
    return state;
  }
}

export function ContextProvider({ children, initialState = {} }) {
  const [state, dispatch] = useReducer(reducer, getInitialState(initialState));
  
  return (
    <context.Provider value={{ state, dispatch }}>
      {children}
    </context.Provider>
  );
}

export function getState() {
  return useContext(context);
}
