import Header from '@stevederico/skateboard-ui/Header';
import { useEffect, useState, useRef } from "react";
import { getBackendURL, getCookie, timestampToString, isSubscriber } from '@stevederico/skateboard-ui/Utilities';

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
