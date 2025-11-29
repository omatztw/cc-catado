"use client";

/**
 * GameBoard - 六角形グリッドのゲームボードを描画するコンポーネント
 * SVGを使用して六角形タイル、頂点、辺を表示
 */

import React, { useMemo, useCallback } from "react";
import type {
  GameState,
  Hex,
  Intersection,
  Edge,
  ResourceType,
  CubeCoordinate,
} from "@/types/game";

// ============================================
// 定数
// ============================================

// 六角形のサイズ（ピクセル）
const HEX_SIZE = 50;

// 六角形の幅と高さ
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

// ボードの中心オフセット
const BOARD_CENTER_X = 300;
const BOARD_CENTER_Y = 280;

// 資源タイプと色のマッピング
const RESOURCE_COLORS: Record<ResourceType, string> = {
  wood: "#228B22",
  brick: "#CD853F",
  wheat: "#FFD700",
  ore: "#696969",
  sheep: "#90EE90",
  desert: "#F5DEB3",
};

// 港の資源アイコン
const PORT_ICONS: Record<string, string> = {
  wood: "🌲",
  brick: "🧱",
  wheat: "🌾",
  ore: "⛏️",
  sheep: "🐑",
  any: "?",
};

// プレイヤー色のマッピング
const PLAYER_COLORS: Record<string, string> = {
  red: "#DC2626",
  blue: "#2563EB",
  orange: "#EA580C",
  white: "#F5F5F5",
};

// ============================================
// ユーティリティ関数
// ============================================

/**
 * キューブ座標をピクセル座標に変換
 */
function cubeToPixel(coord: CubeCoordinate): { x: number; y: number } {
  const x = BOARD_CENTER_X + HEX_SIZE * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const y = BOARD_CENTER_Y + HEX_SIZE * ((3 / 2) * coord.r);
  return { x, y };
}

/**
 * 六角形のパスを生成
 */
function getHexPath(centerX: number, centerY: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = centerX + HEX_SIZE * Math.cos(angle);
    const y = centerY + HEX_SIZE * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return `M ${points.join(" L ")} Z`;
}

/**
 * 頂点のピクセル座標を計算
 */
function getVertexPixel(
  hexCoord: CubeCoordinate,
  direction: "N" | "S"
): { x: number; y: number } {
  const hexPixel = cubeToPixel(hexCoord);
  const yOffset = direction === "N" ? -HEX_SIZE : HEX_SIZE;
  return {
    x: hexPixel.x,
    y: hexPixel.y + yOffset,
  };
}

/**
 * 辺の中点のピクセル座標を計算
 * 角度は辺に沿った方向（頂点間を結ぶ方向）
 */
function getEdgePixel(
  hexCoord: CubeCoordinate,
  direction: "NE" | "E" | "SE"
): { x: number; y: number; angle: number } {
  const hexPixel = cubeToPixel(hexCoord);

  switch (direction) {
    case "NE":
      return {
        x: hexPixel.x + HEX_WIDTH / 4,
        y: hexPixel.y - (3 * HEX_SIZE) / 4,
        angle: 30, // 辺に沿った角度（右下がり）
      };
    case "E":
      return {
        x: hexPixel.x + HEX_WIDTH / 2,
        y: hexPixel.y,
        angle: 90, // 垂直
      };
    case "SE":
      return {
        x: hexPixel.x + HEX_WIDTH / 4,
        y: hexPixel.y + (3 * HEX_SIZE) / 4,
        angle: 150, // 辺に沿った角度（右上がり）
      };
  }
}

// ============================================
// 子コンポーネント
// ============================================

/**
 * 六角形タイルコンポーネント
 */
function HexTile({
  hex,
  onClick,
  isClickable,
}: {
  hex: Hex;
  onClick?: (hexId: string) => void;
  isClickable?: boolean;
}) {
  const { x, y } = cubeToPixel(hex.coordinate);
  const fillColor = RESOURCE_COLORS[hex.resourceType];

  return (
    <g
      className={isClickable ? "cursor-pointer hover:opacity-80" : ""}
      onClick={() => isClickable && onClick?.(hex.id)}
    >
      {/* 六角形本体 */}
      <path
        d={getHexPath(x, y)}
        fill={fillColor}
        stroke="#4A5568"
        strokeWidth="2"
      />

      {/* 数値トークン */}
      {hex.numberToken && (
        <g>
          <circle
            cx={x}
            cy={y}
            r={16}
            fill="#FFF8DC"
            stroke="#4A5568"
            strokeWidth="1"
          />
          <text
            x={x}
            y={y + 5}
            textAnchor="middle"
            fontSize="14"
            fontWeight={hex.numberToken === 6 || hex.numberToken === 8 ? "bold" : "normal"}
            fill={hex.numberToken === 6 || hex.numberToken === 8 ? "#DC2626" : "#1A202C"}
          >
            {hex.numberToken}
          </text>
        </g>
      )}

      {/* 盗賊 */}
      {hex.hasRobber && (
        <g>
          <circle cx={x} cy={y} r={20} fill="rgba(0,0,0,0.7)" />
          <text x={x} y={y + 5} textAnchor="middle" fontSize="16" fill="white">
            ⚔
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * 港マーカーコンポーネント
 * 港は2つの頂点をつなぐので、ペアで表示する
 */
function PortMarker({
  intersection1,
  intersection2,
}: {
  intersection1: Intersection;
  intersection2: Intersection;
}) {
  const port = intersection1.port;
  if (!port) return null;

  const pos1 = getVertexPixel(
    intersection1.coordinate.hex,
    intersection1.coordinate.direction
  );
  const pos2 = getVertexPixel(
    intersection2.coordinate.hex,
    intersection2.coordinate.direction
  );

  // 2つの頂点の中点を計算
  const midX = (pos1.x + pos2.x) / 2;
  const midY = (pos1.y + pos2.y) / 2;

  // 港をボードの外側に向かってオフセット
  const dx = midX - BOARD_CENTER_X;
  const dy = midY - BOARD_CENTER_Y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const offsetX = (dx / distance) * 40;
  const offsetY = (dy / distance) * 40;

  const portX = midX + offsetX;
  const portY = midY + offsetY;

  const isSpecialPort = port.resourceType !== null;
  const icon = isSpecialPort
    ? PORT_ICONS[port.resourceType!]
    : PORT_ICONS.any;
  const ratio = port.ratio;

  return (
    <g>
      {/* 頂点との接続線 */}
      <line
        x1={pos1.x}
        y1={pos1.y}
        x2={portX}
        y2={portY}
        stroke="#8B4513"
        strokeWidth="2"
        strokeDasharray="4"
      />
      <line
        x1={pos2.x}
        y1={pos2.y}
        x2={portX}
        y2={portY}
        stroke="#8B4513"
        strokeWidth="2"
        strokeDasharray="4"
      />
      {/* 港の背景 */}
      <circle
        cx={portX}
        cy={portY}
        r={18}
        fill={isSpecialPort ? "#FEF3C7" : "#E5E7EB"}
        stroke="#8B4513"
        strokeWidth="2"
      />
      {/* 比率 */}
      <text
        x={portX}
        y={portY - 3}
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fill="#1F2937"
      >
        {ratio}:1
      </text>
      {/* アイコン */}
      <text
        x={portX}
        y={portY + 10}
        textAnchor="middle"
        fontSize="11"
      >
        {icon}
      </text>
    </g>
  );
}

/**
 * 頂点（開拓地・都市）コンポーネント
 */
function IntersectionNode({
  intersection,
  players,
  onClick,
  isClickable,
}: {
  intersection: Intersection;
  players: GameState["players"];
  onClick?: (intersectionId: string) => void;
  isClickable?: boolean;
}) {
  const { x, y } = getVertexPixel(
    intersection.coordinate.hex,
    intersection.coordinate.direction
  );

  const player = intersection.building
    ? players.find((p) => p.id === intersection.building!.playerId)
    : null;

  const playerColor = player
    ? PLAYER_COLORS[player.color] || "#888"
    : "#DDD";

  const isCity = intersection.building?.type === "city";

  return (
    <g
      className={isClickable ? "cursor-pointer" : ""}
      onClick={() => isClickable && onClick?.(intersection.id)}
    >
      {intersection.building ? (
        // 建造物がある場合
        isCity ? (
          // 都市（大きな四角形）
          <rect
            x={x - 10}
            y={y - 10}
            width={20}
            height={20}
            fill={playerColor}
            stroke="#1A202C"
            strokeWidth="2"
          />
        ) : (
          // 開拓地（小さな三角形）
          <polygon
            points={`${x},${y - 10} ${x - 8},${y + 6} ${x + 8},${y + 6}`}
            fill={playerColor}
            stroke="#1A202C"
            strokeWidth="2"
          />
        )
      ) : isClickable ? (
        // クリック可能な空の頂点
        <circle
          cx={x}
          cy={y}
          r={8}
          fill="rgba(255,255,255,0.5)"
          stroke="#4A5568"
          strokeWidth="1"
          className="hover:fill-green-300"
        />
      ) : null}
    </g>
  );
}

/**
 * 辺（道）コンポーネント
 */
function EdgeSegment({
  edge,
  players,
  onClick,
  isClickable,
}: {
  edge: Edge;
  players: GameState["players"];
  onClick?: (edgeId: string) => void;
  isClickable?: boolean;
}) {
  const { x, y, angle } = getEdgePixel(
    edge.coordinate.hex,
    edge.coordinate.direction
  );

  const player = edge.road
    ? players.find((p) => p.id === edge.road!.playerId)
    : null;

  const playerColor = player
    ? PLAYER_COLORS[player.color] || "#888"
    : "transparent";

  const roadLength = 30;
  const roadWidth = 8;

  return (
    <g
      className={isClickable ? "cursor-pointer" : ""}
      onClick={() => isClickable && onClick?.(edge.id)}
      transform={`translate(${x}, ${y}) rotate(${angle})`}
    >
      {edge.road ? (
        // 道がある場合
        <rect
          x={-roadLength / 2}
          y={-roadWidth / 2}
          width={roadLength}
          height={roadWidth}
          fill={playerColor}
          stroke="#1A202C"
          strokeWidth="1"
          rx="2"
        />
      ) : isClickable ? (
        // クリック可能な空の辺
        <rect
          x={-roadLength / 2}
          y={-roadWidth / 2}
          width={roadLength}
          height={roadWidth}
          fill="rgba(255,255,255,0.3)"
          stroke="#4A5568"
          strokeWidth="1"
          strokeDasharray="4"
          rx="2"
          className="hover:fill-green-300"
        />
      ) : null}
    </g>
  );
}

// ============================================
// メインコンポーネント
// ============================================

interface GameBoardProps {
  gameState: GameState;
  currentPlayerId: string | null;
  onHexClick?: (hexId: string) => void;
  onIntersectionClick?: (intersectionId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  selectableHexes?: string[];
  selectableIntersections?: string[];
  selectableEdges?: string[];
}

export function GameBoard({
  gameState,
  currentPlayerId,
  onHexClick,
  onIntersectionClick,
  onEdgeClick,
  selectableHexes = [],
  selectableIntersections = [],
  selectableEdges = [],
}: GameBoardProps) {
  // セレクタブルなIDをSetに変換（パフォーマンス向上）
  const selectableHexSet = useMemo(
    () => new Set(selectableHexes),
    [selectableHexes]
  );
  const selectableIntersectionSet = useMemo(
    () => new Set(selectableIntersections),
    [selectableIntersections]
  );
  const selectableEdgeSet = useMemo(
    () => new Set(selectableEdges),
    [selectableEdges]
  );

  return (
    <div className="relative bg-blue-400 rounded-lg overflow-hidden">
      <svg
        viewBox="0 0 600 560"
        className="w-full h-auto"
        style={{ maxHeight: "70vh" }}
      >
        {/* 背景（海） */}
        <rect width="100%" height="100%" fill="#4169E1" />

        {/* 港 */}
        <g id="ports">
          {(() => {
            // 港を持つ頂点をペアにしてレンダリング
            const portIntersections = gameState.intersections.filter((i) => i.port);
            const rendered = new Set<string>();
            const portPairs: { i1: Intersection; i2: Intersection }[] = [];

            for (const i1 of portIntersections) {
              if (rendered.has(i1.id)) continue;
              // 同じ港情報を持つ隣接頂点を探す
              const i2 = portIntersections.find(
                (i) =>
                  i.id !== i1.id &&
                  !rendered.has(i.id) &&
                  i.port?.ratio === i1.port?.ratio &&
                  i.port?.resourceType === i1.port?.resourceType
              );
              if (i2) {
                portPairs.push({ i1, i2 });
                rendered.add(i1.id);
                rendered.add(i2.id);
              }
            }

            return portPairs.map(({ i1, i2 }) => (
              <PortMarker
                key={`port-${i1.id}-${i2.id}`}
                intersection1={i1}
                intersection2={i2}
              />
            ));
          })()}
        </g>

        {/* 六角形タイル */}
        <g id="hexes">
          {gameState.hexes.map((hex) => (
            <HexTile
              key={hex.id}
              hex={hex}
              onClick={onHexClick}
              isClickable={selectableHexSet.has(hex.id)}
            />
          ))}
        </g>

        {/* 辺（道） */}
        <g id="edges">
          {gameState.edges.map((edge) => (
            <EdgeSegment
              key={edge.id}
              edge={edge}
              players={gameState.players}
              onClick={onEdgeClick}
              isClickable={selectableEdgeSet.has(edge.id)}
            />
          ))}
        </g>

        {/* 頂点（開拓地・都市） */}
        <g id="intersections">
          {gameState.intersections.map((intersection) => (
            <IntersectionNode
              key={intersection.id}
              intersection={intersection}
              players={gameState.players}
              onClick={onIntersectionClick}
              isClickable={selectableIntersectionSet.has(intersection.id)}
            />
          ))}
        </g>
      </svg>

      {/* サイコロ結果表示 */}
      {gameState.diceResult && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 flex gap-2">
          <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center text-xl font-bold">
            {gameState.diceResult.die1}
          </div>
          <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center text-xl font-bold">
            {gameState.diceResult.die2}
          </div>
          <div className="w-10 h-10 bg-yellow-100 rounded flex items-center justify-center text-xl font-bold">
            = {gameState.diceResult.total}
          </div>
        </div>
      )}
    </div>
  );
}

export default GameBoard;
