import { cn } from "@/shadcn/ui/lib/utils"
import { Button } from "@/shadcn/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shadcn/ui/components/ui/card"
import { Input } from "@/shadcn/ui/components/ui/input"
import { Label } from "@/shadcn/ui/components/ui/label"
import { DynamicIcon } from "lucide-react/dynamic";

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from "@/constants.json";
import { getState } from '@/context.jsx';
export default function LoginForm({
  className,
  ...props
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const { state, dispatch } = getState();
  const [errorMessage, setErrorMessage] = useState('')

  async function signUpClicked() {
    try {
      console.log(`${constants.backendURL}/signup`);
      console.log(`name: ${name}`);
      const response = await fetch(`${constants.backendURL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });

      if (response.ok) {
        const data = await response.json();
        const expireDate = new Date();
        expireDate.setTime(expireDate.getTime() + 24 * 60 * 60 * 1000);
        document.cookie = `token=${data.token}; path=/; expires=${expireDate.toUTCString()}; Secure; SameSite=Strict;`;
        delete data.token
        dispatch({ type: 'SET_USER', payload: data });
        navigate('/app');
      } else {
        setErrorMessage('Invalid Credentials')
        console.log("error with /signup")
      }
    } catch (error) {
      console.error('Signup failed:', error);
      setErrorMessage('Server Error')
    }
  }

  return (
    (<div className={cn("flex flex-col gap-6 p-4 md:max-w-[50%] mx-auto", className)} {...props}>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center m-2 mx-auto">
            <div className="bg-app dark:border rounded-lg flex aspect-square size-10 items-center justify-center">
              <DynamicIcon name={constants.appIcon} size={24} color="white" strokeWidth={2} />
            </div>
            <div className="font-semibold ml-2 text-4xl">{constants.appName}</div>
          </div>
          {errorMessage !== '' && (
            <div className=" text-red-500 text-center font-semibold  rounded-xl py-2">
              {errorMessage}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form>
            <div className="flex flex-col gap-6">
              <div className="grid gap-3">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="John Smith" required value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErrorMessage('');
                  }} />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="mcfly@example.com" required value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrorMessage('');
                  }} />
              </div>
              <div className="grid gap-3">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input id="password" type="password" placeholder="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="flex flex-col gap-3">
                <Button onClick={(e) => { e.preventDefault(); signUpClicked() }} className="w-full cursor-pointer py-6">
                  Sign Up
                </Button>
              </div>
            </div>
            <div className="mt-6 text-center text-sm">
              Already have an account?{" "}
              <span onClick={(e) => { e.preventDefault(); navigate('/signin'); }} className="underline underline-offset-4 cursor-pointer">
                Sign In
              </span>
            </div>

          </form>
        </CardContent>
      </Card>

      <div className="mt-6 text-center text-sm">
        By registering you agree to our
        <span onClick={(e) => { e.preventDefault(); navigate('/terms'); }} className="ml-1 underline underline-offset-4 cursor-pointer">
          Terms of Service
        </span>,
        <span onClick={(e) => { e.preventDefault(); navigate('/eula'); }} className="ml-1 underline underline-offset-4 cursor-pointer">
          EULA
        </span>,
        <span onClick={(e) => { e.preventDefault(); navigate('/privacy'); }} className="ml-1 underline underline-offset-4 cursor-pointer">
          Privacy Policy
        </span>
      </div>
    </div>)
  );
}
