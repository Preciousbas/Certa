"use client";

import { useEffect, useState } from "react";

export default function Loading() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), 200);
    return () => window.clearTimeout(timer);
  }, []);
  if (!show) return null;
  return (
    <div aria-hidden="true">
      <div className="skel" />
      <div className="skel" style={{ marginTop: 12, width: "70%" }} />
      <div className="card" style={{ marginTop: 16 }}><div className="skel" /></div>
    </div>
  );
}
