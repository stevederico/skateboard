import { useNavigate, Link } from 'react-router-dom';
function MainView() {
  const navigate = useNavigate()
  return (
    <>
      <h1>Main</h1>
      <div onClick={()=>{  document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"; console.log("SIGNED OUT"); navigate('/')}}> Sign Out</div>
    </>
  )
}
export default MainView
