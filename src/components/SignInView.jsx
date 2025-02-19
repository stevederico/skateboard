import { useNavigate, Link } from 'react-router-dom';
function SignInView() {
  const navigate = useNavigate()
  return (
    <>
      <h1>SignInView</h1>
      <div onClick={() => {
        const expireDate = new Date();
        expireDate.setTime(expireDate.getTime() + 24 * 60 * 60 * 1000); // 24 hours in milliseconds
        document.cookie = "token=abc123; path=/; expires=" + expireDate.toUTCString() + ";";
        navigate('/app');
      }}> Sign In</div>
    </>
  )
}
export default SignInView
