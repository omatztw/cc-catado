"use client";

import { useCallback, useRef, useEffect } from "react";

/**
 * 効果音の種類
 */
export type SoundType =
  | "diceRoll"      // サイコロを振る
  | "build"         // 建設（開拓地・都市・道）
  | "turnStart"     // 自分のターン開始
  | "trade"         // 取引成立
  | "card"          // カード取得/使用
  | "robber"        // 盗賊移動
  | "victory";      // 勝利

/**
 * Web Audio APIを使用して効果音を生成・再生するhook
 */
export function useSound(enabled: boolean = true) {
  const audioContextRef = useRef<AudioContext | null>(null);

  // AudioContextの初期化（ユーザー操作後に初期化する必要がある）
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // 効果音を再生
  const playSound = useCallback((type: SoundType) => {
    if (!enabled) return;

    try {
      const ctx = initAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // 効果音の種類に応じて音色を変更
      switch (type) {
        case "diceRoll":
          // サイコロ: 短い連続音
          oscillator.type = "square";
          oscillator.frequency.setValueAtTime(200, ctx.currentTime);
          oscillator.frequency.setValueAtTime(300, ctx.currentTime + 0.05);
          oscillator.frequency.setValueAtTime(250, ctx.currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.15);
          break;

        case "build":
          // 建設: 上昇音
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(300, ctx.currentTime);
          oscillator.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.15);
          gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.2);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.2);
          break;

        case "turnStart":
          // ターン開始: 2音のチャイム
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(523, ctx.currentTime); // C5
          oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.15); // E5
          gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
          gainNode.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
          gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.4);
          break;

        case "trade":
          // 取引: コイン音風
          oscillator.type = "triangle";
          oscillator.frequency.setValueAtTime(800, ctx.currentTime);
          oscillator.frequency.setValueAtTime(1000, ctx.currentTime + 0.05);
          gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.15);
          break;

        case "card":
          // カード: シュッという音
          oscillator.type = "sawtooth";
          oscillator.frequency.setValueAtTime(400, ctx.currentTime);
          oscillator.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.1);
          break;

        case "robber":
          // 盗賊: 不穏な低音
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(150, ctx.currentTime);
          oscillator.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.3);
          gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.3);
          break;

        case "victory":
          // 勝利: ファンファーレ風
          oscillator.type = "sine";
          const freqs = [523, 659, 784, 1047]; // C5, E5, G5, C6
          freqs.forEach((freq, i) => {
            oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
          });
          gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
          gainNode.gain.setValueAtTime(0.2, ctx.currentTime + 0.45);
          gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.8);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.8);
          break;
      }
    } catch (error) {
      console.warn("Sound playback failed:", error);
    }
  }, [enabled, initAudioContext]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return { playSound };
}
