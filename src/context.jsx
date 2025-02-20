import React, { createContext, useContext, useReducer } from 'react';
import pkg from '../package.json';
const context = createContext();
import constants from './constants.json';

function setupConstants() {
    let c = constants
    document.title = c.appName;
    if (import.meta.env.MODE !== "production") {
      c.backendURL = "http://localhost:3000"
      document.title = `LOCAL: ${c.appName}` ;
    }
    c.version = pkg.version
  
    return c
  }

const initialState = {
    constants: setupConstants(),
    user: JSON.parse(localStorage.getItem('user')) || null,
    theme: localStorage.getItem('theme') || 'light'
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_USER':
            localStorage.setItem('user', JSON.stringify(action.payload));
            return { ...state, user: action.payload };
        case 'SET_THEME':
            localStorage.setItem('theme', action.payload);
            return { ...state, theme: action.payload };
        default:
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
