"use client";

import { useEffect, useRef } from "react";

export function LoginWidget({ username, authUrl }: { username: string; authUrl: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node || !authUrl) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", username);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", authUrl);
    script.setAttribute("data-request-access", "write");
    node.appendChild(script);
    return () => {
      node.replaceChildren();
    };
  }, [authUrl, username]);

  return <div ref={host} />;
}
