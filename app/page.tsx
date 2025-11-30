"use client";

import { Suspense } from "react";
import { GameRoom } from "./components/GameRoom";

function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
      <div className="text-white text-xl">読み込み中...</div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <GameRoom />
    </Suspense>
  );
}
