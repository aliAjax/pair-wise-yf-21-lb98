import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Carpet, DamageRegion, Point, Rect, RegionStatus } from "../rules/types";
import { MIN_REGION_PX, normalizeRect } from "../rules/measure";
import { STATUS_LABEL } from "../rules/workflow";

/** 纹样图设计分辨率（像素），区域坐标都以此为准 */
export const DESIGN_W = 640;
export const DESIGN_H = 880;

export const STATUS_COLORS: Record<RegionStatus, string> = {
  pending: "#8a94a6",
  measured: "#d97706",
  reviewed: "#0f766e",
  paused: "#7c3aed",
  repairing: "#2563eb",
  done: "#16a34a",
};

/** 确定性伪随机数，保证同一块地毯的纹样每次渲染一致 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function diamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  fill: boolean
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

/** 按种子与配色画出一块地毯纹样（档案没有实拍图时的示意底图） */
function drawCarpetPattern(
  ctx: CanvasRenderingContext2D,
  seed: number,
  palette: string[]
) {
  const rnd = mulberry32(seed);
  const [field, main, accent, ivory] = palette;

  ctx.fillStyle = field;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // 褪色条纹（abrash）
  for (let i = 0; i < 8; i++) {
    ctx.globalAlpha = 0.04 + rnd() * 0.05;
    ctx.fillStyle = rnd() > 0.5 ? main : accent;
    ctx.fillRect(0, rnd() * DESIGN_H, DESIGN_W, 24 + rnd() * 80);
  }
  ctx.globalAlpha = 1;

  // 边框带
  let inset = 16;
  const bands: Array<[number, string]> = [
    [24, main],
    [6, ivory],
    [14, accent],
    [5, ivory],
  ];
  for (const [w, color] of bands) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.strokeRect(
      inset + w / 2,
      inset + w / 2,
      DESIGN_W - inset * 2 - w,
      DESIGN_H - inset * 2 - w
    );
    inset += w + 6;
  }

  // 主边框上的菱格
  for (let x = 60; x <= DESIGN_W - 60; x += 44) {
    diamond(ctx, x, 28, 8, ivory, true);
    diamond(ctx, x, DESIGN_H - 28, 8, ivory, true);
  }
  for (let y = 60; y <= DESIGN_H - 60; y += 44) {
    diamond(ctx, 28, y, 8, ivory, true);
    diamond(ctx, DESIGN_W - 28, y, 8, ivory, true);
  }

  // 内场边界
  ctx.strokeStyle = ivory;
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, DESIGN_W - inset * 2, DESIGN_H - inset * 2);

  const cx = DESIGN_W / 2;
  const cy = DESIGN_H / 2;

  // 散点纹样（gul），避开中央奖章与四角
  const cornerOff = inset + 74;
  const corners: Array<[number, number]> = [
    [cornerOff, cornerOff],
    [DESIGN_W - cornerOff, cornerOff],
    [cornerOff, DESIGN_H - cornerOff],
    [DESIGN_W - cornerOff, DESIGN_H - cornerOff],
  ];
  const cols = 4;
  const rows = 7;
  const gx0 = inset + 60;
  const gx1 = DESIGN_W - inset - 60;
  const gy0 = inset + 60;
  const gy1 = DESIGN_H - inset - 60;
  ctx.lineWidth = 3;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = gx0 + ((gx1 - gx0) * (i + 0.5)) / cols;
      const y = gy0 + ((gy1 - gy0) * (j + 0.5)) / rows;
      if (Math.abs(x - cx) < 195 && Math.abs(y - cy) < 195) continue;
      if (corners.some(([qx, qy]) => Math.hypot(x - qx, y - qy) < 95)) continue;
      const color = [main, accent, ivory][Math.floor(rnd() * 3)];
      diamond(ctx, x, y, 18, color, false);
      diamond(ctx, x, y, 7, color, true);
    }
  }

  // 中央奖章
  const rings: Array<[number, string]> = [
    [168, accent],
    [138, ivory],
    [108, main],
    [72, ivory],
    [38, accent],
  ];
  for (const [r, color] of rings) diamond(ctx, cx, cy, r, color, true);
  diamond(ctx, cx, cy, 14, field, true);

  // 四角纹样
  for (const [qx, qy] of corners) {
    diamond(ctx, qx, qy, 52, main, true);
    diamond(ctx, qx, qy, 30, ivory, true);
    diamond(ctx, qx, qy, 12, accent, true);
  }
}

function drawRegion(
  ctx: CanvasRenderingContext2D,
  region: DamageRegion,
  selected: boolean
) {
  const { x, y, w, h } = region.rect;
  const color = STATUS_COLORS[region.status];
  ctx.save();

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;

  if (selected) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 7;
    ctx.strokeRect(x, y, w, h);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 3.5 : 2.5;
  if (region.status === "pending" || region.status === "paused") {
    ctx.setLineDash([8, 5]);
  }
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  const d = region.dims;
  const text = d
    ? `${region.label} 长${d.heightCm}×宽${d.widthCm}cm`
    : `${region.label} ${STATUS_LABEL[region.status]}`;
  ctx.font = "600 17px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const tw = ctx.measureText(text).width;
  const tx = Math.min(Math.max(4, x), DESIGN_W - tw - 20);
  const ty = y - 30 >= 4 ? y - 30 : y + 6;
  ctx.fillStyle = color;
  ctx.fillRect(tx, ty, tw + 16, 24);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, tx + 8, ty + 17.5);

  ctx.restore();
}

interface Props {
  carpet: Carpet;
  selectedRegionId: string | null;
  onSelectRegion(id: string | null): void;
  onCreateRegion(rect: Rect): void;
}

export default function PatternCanvas({
  carpet,
  selectedRegionId,
  onSelectRegion,
  onCreateRegion,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragFrom = useRef<Point | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
    drawCarpetPattern(ctx, carpet.seed, carpet.palette);
    for (const r of carpet.regions) drawRegion(ctx, r, r.id === selectedRegionId);
    if (draft) {
      ctx.save();
      ctx.strokeStyle = "#172033";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(draft.x, draft.y, draft.w, draft.h);
      ctx.restore();
    }
  }, [carpet, selectedRegionId, draft]);

  const toDesign = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * DESIGN_W,
      y: ((e.clientY - box.top) / box.height) * DESIGN_H,
    };
  };

  const hitRegion = (p: Point): DamageRegion | null => {
    for (let i = carpet.regions.length - 1; i >= 0; i--) {
      const r = carpet.regions[i].rect;
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        return carpet.regions[i];
      }
    }
    return null;
  };

  return (
    <canvas
      ref={canvasRef}
      className="pattern-canvas"
      width={DESIGN_W}
      height={DESIGN_H}
      onPointerDown={(e) => {
        const p = toDesign(e);
        const hit = hitRegion(p);
        if (hit) {
          onSelectRegion(hit.id);
          dragFrom.current = null;
        } else {
          onSelectRegion(null);
          dragFrom.current = p;
        }
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragFrom.current) return;
        setDraft(normalizeRect(dragFrom.current, toDesign(e)));
      }}
      onPointerUp={(e) => {
        if (!dragFrom.current) return;
        const rect = normalizeRect(dragFrom.current, toDesign(e));
        dragFrom.current = null;
        setDraft(null);
        if (rect.w >= MIN_REGION_PX && rect.h >= MIN_REGION_PX) {
          onCreateRegion(rect);
        }
      }}
    />
  );
}
