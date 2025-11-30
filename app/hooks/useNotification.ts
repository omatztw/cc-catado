"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * ブラウザ通知を管理するhook
 */
export function useNotification(enabled: boolean = true) {
  const [permission, setPermission] = useState<NotificationPermission>("default");

  // 通知権限の確認と初期化
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // 通知権限をリクエスト
  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      console.warn("This browser does not support notifications");
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === "granted";
    } catch (error) {
      console.warn("Failed to request notification permission:", error);
      return false;
    }
  }, []);

  // 通知を送信
  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!enabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    // ページがアクティブな場合は通知しない
    if (document.visibilityState === "visible") return;

    try {
      const notification = new Notification(title, {
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        ...options,
      });

      // クリックでウィンドウにフォーカス
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // 5秒後に自動で閉じる
      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.warn("Failed to send notification:", error);
    }
  }, [enabled]);

  // ターン通知
  const notifyTurn = useCallback(() => {
    sendNotification("あなたのターンです！", {
      body: "カタンのゲームであなたの番が回ってきました。",
      tag: "turn-notification",
      requireInteraction: false,
    });
  }, [sendNotification]);

  return {
    permission,
    requestPermission,
    sendNotification,
    notifyTurn,
    isSupported: typeof window !== "undefined" && "Notification" in window,
  };
}
