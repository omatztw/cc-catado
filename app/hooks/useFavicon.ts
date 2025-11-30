"use client";

import { useCallback, useEffect, useRef } from "react";

const FAVICON_NORMAL = "/favicon.svg";
const FAVICON_NOTIFICATION = "/favicon-notification.svg";

/**
 * ファビコンを動的に変更するためのhook
 * ターン通知などでタブ上に視覚的な通知を表示する
 */
export function useFavicon() {
  const originalTitle = useRef<string>("");
  const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isNotificationActive = useRef<boolean>(false);

  // ファビコンを設定
  const setFavicon = useCallback((href: string) => {
    if (typeof document === "undefined") return;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      document.head.appendChild(link);
    }
    link.href = href;
  }, []);

  // 通知モードを開始（ファビコンを通知版に変更 + タイトル点滅）
  const startNotification = useCallback(() => {
    if (typeof document === "undefined") return;
    if (isNotificationActive.current) return;

    isNotificationActive.current = true;
    originalTitle.current = document.title;

    // ファビコンを通知版に変更
    setFavicon(FAVICON_NOTIFICATION);

    // タイトルを点滅させる
    let showNotification = true;
    blinkIntervalRef.current = setInterval(() => {
      if (showNotification) {
        document.title = "🔔 あなたのターン！";
      } else {
        document.title = originalTitle.current;
      }
      showNotification = !showNotification;
    }, 1000);
  }, [setFavicon]);

  // 通知モードを停止（通常のファビコンに戻す）
  const stopNotification = useCallback(() => {
    if (typeof document === "undefined") return;
    if (!isNotificationActive.current) return;

    isNotificationActive.current = false;

    // ファビコンを通常版に戻す
    setFavicon(FAVICON_NORMAL);

    // タイトル点滅を停止
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }

    // 元のタイトルに戻す
    if (originalTitle.current) {
      document.title = originalTitle.current;
    }
  }, [setFavicon]);

  // ページがアクティブになったら通知を停止
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isNotificationActive.current) {
        stopNotification();
      }
    };

    // ウィンドウにフォーカスが当たったときも通知を停止
    const handleFocus = () => {
      if (isNotificationActive.current) {
        stopNotification();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    // 初期ファビコンを設定
    setFavicon(FAVICON_NORMAL);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
      }
    };
  }, [setFavicon, stopNotification]);

  return {
    setFavicon,
    startNotification,
    stopNotification,
    isNotificationActive: () => isNotificationActive.current,
  };
}
