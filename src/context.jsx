import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { getCurrentUser } from '@/skateboard-ui/Utilities.js';
import constants from "@/constants.json"
const context = createContext();

// Safely parse user from localStorage, fallback to null on error
const getInitialUser = () => {
  if (typeof window === 'undefined') return null;
  
  try {
    const storedUser = localStorage.getItem('user');
    if (!storedUser || storedUser === "undefined") return null;
    return JSON.parse(storedUser);
  } catch (e) {
    return null;
  }
};

function reducer(state, action) {
  try {
    switch (action.type) {
      case 'SET_USER':
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(action.payload));
        }
        return { ...state, user: action.payload };
      case 'CLEAR_USER':
        if (typeof window !== 'undefined') {
          localStorage.removeItem('user');
          document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        }
        return { ...state, user: null };
      default:
        return state;
    }
  } catch (e) {
    return state;
  }
}

export function ContextProvider({ children, initialState }) {
  const defaultState = initialState || { user: getInitialUser() };
  const [state, dispatch] = useReducer(reducer, defaultState);

  useEffect(() => {
    document.title = constants.appName;

    async function appStart() {
      if (typeof window !== 'undefined' && window.location.pathname.includes("app")) {
        const localUser = localStorage.getItem('user');
        if (localUser) {
          try {
            const data = await getCurrentUser();
            dispatch({ type: 'SET_USER', payload: data });
          } catch (error) {
            // Silent failure - will redirect in protected route
          }
        }
      } 
    }
    appStart();
  }, []);

  return (
    <context.Provider value={{ state, dispatch }}>
      {children}
    </context.Provider>
  );
}

export function getState() {
  return useContext(context);
}