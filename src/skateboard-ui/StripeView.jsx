import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getState } from '@/context.jsx';
import constants from "@/constants.json";

export default function SuccessView() {
  const navigate = useNavigate();
  const { state, dispatch } = getState();
  const [searchParams] = useSearchParams(); // Hook to access query params

  useEffect(() => {
    // Get query parameters
    const success = searchParams.get('success') === 'true';
    const canceled = searchParams.get('canceled') === 'true';
    const portal = searchParams.get('portal') === 'return';

    // Default redirect path
    let redirectPath = '/app/home'; // Fallback if no URL is stored

    // Handle different cases
    switch (true) {
      case success:
        console.log("Checkout was successful!");
        redirectPath = localStorage.getItem('beforeCheckoutURL') || redirectPath;
        getCurrentUser(); // Only call getCurrentUser on success
        break;
      case canceled:
        console.log("Checkout was canceled!");
        redirectPath = localStorage.getItem('beforeCheckoutURL') || redirectPath;
        break;
      case portal:
        console.log("Returned from billing portal!");
        redirectPath = localStorage.getItem('beforeManageURL') || redirectPath;
        break;
      default:
        console.log("No specific query param detected, using default redirect.");
        redirectPath = localStorage.getItem('beforeCheckoutURL') || redirectPath;
        break;
    }

    // Clear the stored URLs
    localStorage.removeItem('beforeCheckoutURL');
    localStorage.removeItem('beforeManageURL');

    // Redirect after a delay
    const timeoutId = setTimeout(() => {
      navigate(redirectPath, { replace: true });
    }, 1500);

    // Cleanup timeout
    return () => clearTimeout(timeoutId);
  }, [navigate, searchParams]); // Include searchParams in dependencies

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
      <p className="text-lg font-medium"> Redirecting...</p>
    </div>
  );
}