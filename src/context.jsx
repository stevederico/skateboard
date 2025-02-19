import React, { createContext, useContext, useReducer, useRef } from 'react';
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
    "constants": setupConstants()
};

function reducer(state, action) {
    return state;
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
