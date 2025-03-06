import { isSubscriber } from "@/skateboard-ui/Utilities";
import { useEffect } from "react";

export default function HomeView() {

  useEffect(() => {
    isSubscriber().then(s => {
      // Implement subscriber status handling if necessary
    });
  }, []);

  return (
    <>
      <nav className="flex border-b w-full">
        <h1 className="m-3 p-2 text-xl hover:bg-accent hover:text-accent-foreground rounded cursor-pointer font-medium">
          Home
        </h1>
      </nav>
    </>
  )
}
