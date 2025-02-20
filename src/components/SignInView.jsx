import { useNavigate, Link } from 'react-router-dom';
export default function SignInView() {
  const navigate = useNavigate()
  return (
<div className="flex flex-col">
  <div className="text-xl font-semibold my-3 mx-3">Sign In</div>
  <div className="rounded px-3 border cursor-pointer m-1 grow-0 self-start w-auto" onClick={() => {
        const expireDate = new Date();
        expireDate.setTime(expireDate.getTime() + 24 * 60 * 60 * 1000); // 24 hours in milliseconds
        document.cookie = "token=abc123; path=/; expires=" + expireDate.toUTCString() + ";";
        navigate('/app');
      }}> Sign In</div>
    </div>
  )
}

