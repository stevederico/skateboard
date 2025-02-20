export default function SignUpView() {
  function signUpClicked() {
    console.log('signUpClicked');
  } 
  
  return (
    <>
      <div>Sign Up</div>
      <form className="flex flex-col m-3">
        <input type="text" placeholder="Name" className="mb-2 p-2 border rounded-xl " />
        <input type="email" placeholder="Email" className="mb-2 p-2 border  rounded-xl" />
        <input type="password" placeholder="Password" className="mb-2 p-2 border  rounded-xl" />
        <button type="submit" className="p-2 bg-blue-500 text-white  rounded-xl" onClick={() => { signUpClicked() }}>Sign Up</button>
      </form>
    </>
  )
}

