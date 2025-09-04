import Header from '@stevederico/skateboard-ui/Header';
import { useEffect, useState, useRef } from "react";
import { getBackendURL, getCookie, timestampToString, isSubscriber } from '@stevederico/skateboard-ui/Utilities';

export default function BlankView() {
  return (
    <>
      <Header
        buttonClass=""
        title={"Blank"}
      />
    </>
  )
}