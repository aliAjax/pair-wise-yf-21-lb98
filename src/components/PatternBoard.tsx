import { useRef, useState } from "react";
import type { Carpet } from "../storage/archiveStore";
import {
  normalizeRect,
  round1,
  STATUS_COLOR,
  STATUS_LABEL,
  type Region,
} from "../rules/measurement";

interface Props {
  carpet: Carpet;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDraw: (rect: Region["rect"]) => void;
  onError: (msg: string) => void;
}

interface Draft {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 纹样图定损板：底图 + SVG 覆盖层，坐标按纹样图原始像素存储 */
export function PatternBoard({ carpet, selectedId, onSelect, onDraw, onError }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const drawing = useRef(false);

  const toNatural = (clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const box = el.getBoundingClientRect();
    return {
      x: ((clientX - box.left) / box.width) * carpet.pattern.width,
      y: ((clientY - box.top) / box.height) * carpet.pattern.height,
    };
  };

  const handleDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!carpet.scale) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const p = toNatural(e.clientX, e.clientY);
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing.current || !draft) return;
    const p = toNatural(e.clientX, e.clientY);
    setDraft({ ...draft, w: p.x - draft.x, h: p.y - draft.y });
  };

  const handleUp = () => {
    if (!drawing.current || !draft) return;
    drawing.current = false;
    setDraft(null);
    try {
      const rect = normalizeRect(
        { x: draft.x, y: draft.y, width: draft.w, height: draft.h },
        carpet.pattern.width,
        carpet.pattern.height,
      );
      onDraw(rect);
    } catch (err) {
      onError((err as Error).message);
    }
  };

  const canDraw = Boolean(carpet.scale);

  return (
    <div className={"board" + (canDraw ? "" : " board-locked")}>
      <img src={carpet.pattern.url} alt={`${carpet.id} 纹样图`} draggable={false} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${carpet.pattern.width} ${carpet.pattern.height}`}
        preserveAspectRatio="none"
        className="board-svg"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      >
        {carpet.regions.map((r) => (
          <RegionShape
            key={r.id}
            region={r}
            imageWidth={carpet.pattern.width}
            imageHeight={carpet.pattern.height}
            selected={r.id === selectedId}
            onSelect={onSelect}
          />
        ))}
        {draft && <DraftShape draft={draft} />}
      </svg>
      {!canDraw && (
        <div className="board-mask">
          <strong>尚未录入比例</strong>
          <span>请先在右侧录入经、纬方向每厘米像素值，再在纹样图上圈选破损区域</span>
        </div>
      )}
      {canDraw && (
        <p className="board-hint">
          在纹样图上按住拖动即可圈出破损区域；点击已有框可查看尺寸与复核信息。
        </p>
      )}
    </div>
  );
}

function dimsLabel(r: Region): string {
  if (r.status === "paused" && r.staleMeasurement) {
    return `旧 ${round1(r.staleMeasurement.widthCm)}×${round1(r.staleMeasurement.lengthCm)}cm 已失效`;
  }
  if (!r.measurement) return STATUS_LABEL[r.status];
  const m = r.measurement;
  return `${round1(m.widthCm)}×${round1(m.lengthCm)}cm · ${STATUS_LABEL[r.status]}`;
}

function RegionShape({
  region,
  imageWidth,
  imageHeight,
  selected,
  onSelect,
}: {
  region: Region;
  imageWidth: number;
  imageHeight: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = STATUS_COLOR[region.status];
  const x = Math.min(region.rect.x, region.rect.x + region.rect.width);
  const y = Math.min(region.rect.y, region.rect.y + region.rect.height);
  const w = Math.abs(region.rect.width);
  const h = Math.abs(region.rect.height);
  const paused = region.status === "paused";
  const label = `${region.index}. ${region.label}｜${dimsLabel(region)}`.slice(0, 30);
  const labelW = Math.max(240, Math.min(label.length * 15 + 12, imageWidth));
  const labelX = Math.min(x, imageWidth - labelW);
  const labelY = y - 30 >= 4 ? y - 30 : Math.min(y + h + 4, imageHeight - 30);

  return (
    <g
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(region.id);
      }}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={color}
        fillOpacity={selected ? 0.22 : 0.12}
        stroke={color}
        strokeWidth={selected ? 5 : 3}
        strokeDasharray={paused || region.status === "pending" ? "14 10" : undefined}
      />
      {paused && (
        <line x1={x} y1={y} x2={x + w} y2={y + h} stroke={color} strokeWidth={3} />
      )}
      {paused && (
        <line x1={x + w} y1={y} x2={x} y2={y + h} stroke={color} strokeWidth={3} />
      )}
      <g transform={`translate(${labelX}, ${labelY})`}>
        <rect width={labelW} height={26} fill={color} rx={4} />
        <text x={8} y={19} fontSize={18} fill="#fff" fontWeight={700}>
          {label}
        </text>
      </g>
    </g>
  );
}

function DraftShape({ draft }: { draft: Draft }) {
  const x = Math.min(draft.x, draft.x + draft.w);
  const y = Math.min(draft.y, draft.y + draft.h);
  const w = Math.abs(draft.w);
  const h = Math.abs(draft.h);
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill="#0f766e"
      fillOpacity={0.18}
      stroke="#0f766e"
      strokeWidth={3}
      strokeDasharray="10 6"
      pointerEvents="none"
    />
  );
}
