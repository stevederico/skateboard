import { isSubscriber } from "@/skateboard-ui/Utilities";
import { useEffect } from "react";

export default function HomeView() {

  useEffect( ()=>{
    console.log("HOME")
    async function now(){
      let s =  await isSubscriber()
      console.log("S ", s)
    }
    now()
  }, [])

  return (
    <>
      <div className="flex border-b w-full">
        <div className="m-3 p-2 text-xl hover:bg-accent hover:text-accent-foreground rounded cursor-pointer font-medium">
          Home
        </div>
      </div>
    </>
  )
}

