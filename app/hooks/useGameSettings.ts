"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * ゲーム設定の型
 */
export interface GameSettings {
  soundEnabled: boolean;
  notificationEnabled: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  notificationEnabled: true,
};

const STORAGE_KEY = "catado-settings";

/**
 * ゲーム設定を管理するhook
 * localStorageに永続化
 */
export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // localStorageから設定を読み込み
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.warn("Failed to load settings:", error);
    }
    setIsLoaded(true);
  }, []);

  // 設定を保存
  const saveSettings = useCallback((newSettings: GameSettings) => {
    setSettings(newSettings);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      } catch (error) {
        console.warn("Failed to save settings:", error);
      }
    }
  }, []);

  // 効果音の切り替え
  const toggleSound = useCallback(() => {
    saveSettings({ ...settings, soundEnabled: !settings.soundEnabled });
  }, [settings, saveSettings]);

  // 通知の切り替え
  const toggleNotification = useCallback(() => {
    saveSettings({ ...settings, notificationEnabled: !settings.notificationEnabled });
  }, [settings, saveSettings]);

  return {
    settings,
    isLoaded,
    toggleSound,
    toggleNotification,
    saveSettings,
  };
}
