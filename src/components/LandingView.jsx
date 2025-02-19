import { useNavigate } from 'react-router-dom';
function LandingView() {
  let navigate = useNavigate()
  return (
    <div className="flex flex-col ">
      <div className="text-xl font-semibold my-3 mx-3">Landing</div>
      <div className="rounded px-3 border cursor-pointer m-1 grow-0 self-start w-auto" onClick={() => {
        navigate('/app');
      }}> Go to App</div>
    </div>
  )
}
export default LandingView
