"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type TelegramButton = {
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
  setText?: (text: string) => void;
};

type TelegramWebApp = {
  initData?: string;
  colorScheme?: "light" | "dark";
  themeParams?: {
    bg_color?: string;
    secondary_bg_color?: string;
    text_color?: string;
    hint_color?: string;
    button_color?: string;
    button_text_color?: string;
  };
  ready: () => void;
  expand: () => void;
  onEvent: (event: string, callback: () => void) => void;
  offEvent: (event: string, callback: () => void) => void;
  BackButton?: TelegramButton;
  MainButton?: TelegramButton;
  HapticFeedback?: { notificationOccurred: (type: "success" | "warning" | "error") => void };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function applyTheme(webApp: TelegramWebApp) {
  const root = document.documentElement;
  root.dataset.theme = webApp.colorScheme === "dark" ? "dark" : "light";
  const params = webApp.themeParams;
  if (!params) return;
  if (params.bg_color) root.style.setProperty("--bg", params.bg_color);
  if (params.secondary_bg_color) root.style.setProperty("--card", params.secondary_bg_color);
  if (params.text_color) root.style.setProperty("--text", params.text_color);
  if (params.hint_color) root.style.setProperty("--muted", params.hint_color);
}

export function TelegramChrome() {
  const path = usePathname();
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.ready) return;
    webApp.ready();
    webApp.expand?.();
    applyTheme(webApp);
    const onTheme = () => applyTheme(webApp);
    webApp.onEvent?.("themeChanged", onTheme);
    const goBack = () => {
      if (window.history.length > 1) window.history.back();
      else window.location.href = "/";
    };
    if (path !== "/") {
      webApp.BackButton?.show();
      webApp.BackButton?.onClick(goBack);
    } else {
      webApp.BackButton?.hide();
    }
    return () => {
      webApp.offEvent?.("themeChanged", onTheme);
      webApp.BackButton?.offClick(goBack);
      webApp.BackButton?.hide();
    };
  }, [path]);
  return null;
}

export function useTelegramMainButton(text: string, onPress: () => void, enabled: boolean) {
  const press = useRef(onPress);
  press.current = onPress;
  useEffect(() => {
    const button = window.Telegram?.WebApp?.MainButton;
    if (!button?.setText || !enabled) return;
    const run = () => press.current();
    button.setText(text);
    button.show();
    button.onClick(run);
    return () => {
      button.offClick(run);
      button.hide();
    };
  }, [text, enabled]);
}
