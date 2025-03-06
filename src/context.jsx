import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { getCurrentUser } from '@/skateboard-ui/Utilities.js';
import constants from "@/constants.json"
const context = createContext();

// Safely parse user from localStorage, fallback to null on error
const getInitialUser = () => {
  try {
    const storedUser = localStorage.getItem('user');
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
    switch (action.type) {
      case 'SET_USER':
        console.log("SET_USER: ", action.payload);
        localStorage.setItem('user', JSON.stringify(action.payload));
        return { ...state, user: action.payload };
      case 'CLEAR_USER':
        localStorage.removeItem('user');
        document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
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

  useEffect(() => {
    document.title = constants.appName

    async function appStart() {
      if (window.location.pathname.includes("app")) {
        const localUser = localStorage.getItem('user');
        if (localUser){
          try {
            console.log("APP START - Fetching user");
            const data = await getCurrentUser();
            if (data) {
              dispatch({ type: 'SET_USER', payload: data });
            } else {
              window.location.href = "/signin";
              console.log("REDIRECT 1")
            }
          } catch (error) {
            console.error('Failed to fetch user:', error);
          }
        } else {
          // window.location.href = "/signin";
          console.log("REDIRECT 2")
        }
      } 
    }
    appStart();
  }, []); // Run once on mount

  return (
    <context.Provider value={{ state, dispatch }}>
      {children}
    </context.Provider>
  );
}

export function getState() {
  return useContext(context);
}