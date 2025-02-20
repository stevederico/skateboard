import React, { createContext, useContext, useReducer } from 'react';
import pkg from '../package.json';
const context = createContext();
import constants from './constants.json';

function setupConstants() {
  try {
    const c = { ...constants };
    document.title = c.appName;
    // if (import.meta.env.MODE !== "production") {
    //   c.backendURL = "http://localhost:3000";
    //   document.title = `LOCAL: ${c.appName}`;
    // }
    c.version = pkg.version;
    return c;
  } catch (e) {
    console.error('Failed to setup constants:', e);
    return constants;
  }
}

const initialState = {
  constants: setupConstants(),
  user: (() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || null;
    } catch (e) {
      console.error('Failed to parse user data:', e);
      return null;
    }
  })(),
  theme: localStorage.getItem('theme') || 'light'
};

function reducer(state, action) {
  try {
    switch (action.type) {
      case 'SET_USER':
        localStorage.setItem('user', JSON.stringify(action.payload));
        return { ...state, user: action.payload };
      case 'SET_THEME':
        localStorage.setItem('theme', action.payload);
        return { ...state, theme: action.payload };
      case 'CLEAR_USER':
        localStorage.removeItem('user');
        return { ...state, user: null };
      default:
        return state;
    }
  } catch (e) {
    console.error('Reducer error:', e);
    return state;
  }
}

export function ContextProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    return (
        <context.Provider value={{ state, dispatch }}>
            {children}
        </context.Provider>
    );
}

export function getState() {
    return useContext(context)
}
