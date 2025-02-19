import React, { createContext, useContext, useReducer, useRef } from 'react';
const MyContext = createContext();
import constants from './constants.json';

const initialState = {  
    "constants": constants
};
function reducer(state, action) {
    switch (action.type) {
      case 'SET_CURRENT_USER':
        if (action.payload == null){
          delete localStorage[`${state.constants.appURL}_TOKEN`]
        }
        return { ...state, currentUser: action.payload };
      default:
        return state;
    }
  }

  export function ContextProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    return (
      <MyContext.Provider value={{ state, dispatch }}>
        {children}
      </MyContext.Provider>
    );
  }
  