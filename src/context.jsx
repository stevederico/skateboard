import React, { createContext, useContext, useReducer } from 'react';
import constants from './constants.json';

const context = createContext();

// Create app-specific storage key using app name
const getStorageKey = () => {
  const appName = constants.appName || 'skateboard';
  return `${appName.toLowerCase().replace(/\s+/g, '-')}_user`;
};

// Create app-specific cookie name
const getCookieName = () => {
  const appName = constants.appName || 'skateboard';
  return `${appName.toLowerCase().replace(/\s+/g, '-')}_token`;
};

// Properly clear cookie with all possible attributes
const clearCookie = (cookieName) => {
  const hostname = window.location.hostname;
  const domain = hostname.includes('.') ? hostname.split('.').slice(-2).join('.') : hostname;
  
  // Clear with various combinations of attributes to ensure it's deleted
  const clearVariations = [
    `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;`,
    `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=${hostname};`,
    `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${domain};`,
    `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; Secure; SameSite=Strict;`,
    `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=${hostname}; Secure; SameSite=Strict;`,
    `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${domain}; Secure; SameSite=Strict;`
  ];
  
  clearVariations.forEach(cookieStr => {
    document.cookie = cookieStr;
  });
};

// Safely parse user from localStorage, fallback to null on error
const getInitialUser = () => {
  try {
    const storageKey = getStorageKey();
    const storedUser = localStorage.getItem(storageKey);
    if (!storedUser || storedUser === "undefined") return null;
    return JSON.parse(storedUser);
  } catch (e) {
    return null;
  }
};

const initialState = {
  user: getInitialUser()
};

function reducer(state, action) {
  try {
    const storageKey = getStorageKey();
    const cookieName = getCookieName();
    const appName = constants.appName || 'skateboard';
    const csrfKey = `${appName.toLowerCase().replace(/\s+/g, '-')}_csrf`;

    switch (action.type) {
      case 'SET_USER':
        console.log("SET_USER: ", action.payload);
        localStorage.setItem(storageKey, JSON.stringify(action.payload));
        return { ...state, user: action.payload };
      case 'CLEAR_USER':
        localStorage.removeItem(storageKey);
        localStorage.removeItem(csrfKey); // Clear CSRF token
        clearCookie(cookieName);

        return { ...state, user: null };
      default:
        return state;
    }
  } catch (e) {
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
  return useContext(context);
}