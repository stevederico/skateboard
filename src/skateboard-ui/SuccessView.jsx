import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getState } from '@/context.jsx';
import constants from "@/constants.json";

export default function SuccessView() {
    const navigate = useNavigate();
    const { state, dispatch } = getState();
    useEffect(() => {
        const redirectPath = localStorage.getItem('redirectPath') || '/app/home';
        localStorage.removeItem('redirectPath');

        getCurrentUser();

        const timeoutId = setTimeout(() => {
            navigate(redirectPath, { replace: true });
        }, 1500);

        return () => clearTimeout(timeoutId);
    }, [navigate]);

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    async function getCurrentUser() {
        const token = getCookie('token');
        if (!token) {
            console.error('No token found in cookie');
            return;
        }

        try {
            const response = await fetch(`${constants.backendURL}/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            dispatch({ type: 'SET_USER', payload: data });
            console.log('Current user:', data);
            return data;
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    }

    return (
        <div className="flex items-center justify-center h-screen">
            <p className="text-lg font-medium">Subscription successful! Redirecting...</p>
        </div>
    );
}