import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getState } from '../context.jsx';

export default function SignUpView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { state } = getState();

  async function signUpClicked() {
    try {
      console.log(`${state.constants.backendURL}/signup`);
      const response = await fetch(`${state.constants.backendURL}/signup`, {
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
      console.error('Signup failed:', error);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-3 rounded-xl bg-white dark:bg-dark-component">
        <h1 className="text-2xl font-bold text-center">Sign Up</h1>
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
            onClick={signUpClicked}
            className="w-full px-4 py-2 font-bold text-white bg-blue-500 rounded-md hover:bg-blue-600"
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}

