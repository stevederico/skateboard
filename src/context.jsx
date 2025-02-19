import React, { createContext, useContext, useReducer, useRef } from 'react';
const context = createContext();
import constants from './constants.json';

const initialState = {
    "constants": constants
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
