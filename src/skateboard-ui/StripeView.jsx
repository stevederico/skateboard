import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getState } from '@/context.jsx';
import { getCurrentUser } from './Utilities.js'

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
  
    async function getUser() {
      let data = await getCurrentUser();
      dispatch({ type: 'SET_USER', payload: data });
    }
  
    // Handle different cases
    switch (true) {
      case success:
        console.log("Checkout was successful!");
        redirectPath = localStorage.getItem('beforeCheckoutURL') || redirectPath;
        getUser();
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
  
    // Normalize redirectPath: Strip any full URL to just the pathname
    if (redirectPath.startsWith('http://') || redirectPath.startsWith('https://')) {
      try {
        const url = new URL(redirectPath);
        redirectPath = url.pathname; // Extract just the path (e.g., '/app/settings')
      } catch (e) {
        console.error('Invalid URL in redirectPath:', redirectPath);
        redirectPath = '/app/home'; // Fallback to default if parsing fails
      }
    }
  
    // Ensure it starts with a '/'
    if (!redirectPath.startsWith('/')) {
      redirectPath = `/${redirectPath}`;
    }
  
    // Debug the redirectPath
    console.log('Redirecting to path:', redirectPath);
  
    // Clear the stored URLs
    localStorage.removeItem('beforeCheckoutURL');
    localStorage.removeItem('beforeManageURL');
  
    // Redirect after a delay
    const timeoutId = setTimeout(() => {
      navigate(redirectPath, { replace: true });
    }, 1500);
  
    // Cleanup timeout
    return () => clearTimeout(timeoutId);
  }, [navigate, searchParams]);





  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-lg font-medium"> Redirecting...</p>
    </div>
  );
}