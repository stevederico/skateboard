import { isSubscriber } from "@stevederico/skateboard-ui/Utilities";
import { useEffect } from "react";
import Header from '@stevederico/skateboard-ui/Header';
export default function HomeView() {

  useEffect(() => {
    isSubscriber().then(s => {
      // Implement subscriber status handling if necessary
    });
  }, []);

  return (
    <>

      <Header
          buttonClass=""
          title={"Home"}
        ></Header>

    </>
  )
}
