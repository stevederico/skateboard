import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getState } from '../../context.jsx';

export default function SignInView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { state } = getState();

  async function signInClicked() {
    try {
      const response = await fetch(`${state.constants.backendURL}/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      if (response.ok) {
        const data = await response.json();
        const expireDate = new Date();
        expireDate.setTime(expireDate.getTime() + 24 * 60 * 60 * 1000);
        document.cookie = `token=${data.token}; path=/; expires=${expireDate.toUTCString()}; Secure; SameSite=Strict;`;
        navigate('/app');
      }
    } catch (error) {
      console.error('Signin failed:', error);
    }
  }

  function signUpClicked() {
    navigate('/signup');
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-3 rounded-xl bg-white dark:bg-dark-component">
        <h1 className="text-2xl font-bold text-center">Sign In</h1>
        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full px-3 py-2 border rounded-md"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full px-3 py-2 border rounded-md"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            onClick={signInClicked}
            className="w-full px-4 py-2 font-bold text-white bg-blue-500 rounded-md hover:bg-blue-600"
          >
            Sign In
          </button>
          <button
            onClick={signUpClicked}
            className="w-full px-4 py-2 font-bold text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}

