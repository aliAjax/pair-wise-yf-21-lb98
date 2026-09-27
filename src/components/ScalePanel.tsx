import { useEffect, useState } from "react";
import type { Scale } from "../rules/types";
import { fmtTime } from "./format";

interface Props {
  scale: Scale | null;
  onSave(warpPxPerCm: number, weftPxPerCm: number, reason: string): void;
}

const REASONS = ["初始标定", "清洗缩水后复测", "例行校准"];

export default function ScalePanel({ scale, onSave }: Props) {
  const [warp, setWarp] = useState(scale ? String(scale.warpPxPerCm) : "");
  const [weft, setWeft] = useState(scale ? String(scale.weftPxPerCm) : "");
  const [reason, setReason] = useState(scale ? REASONS[1] : REASONS[0]);

  useEffect(() => {
    setWarp(scale ? String(scale.warpPxPerCm) : "");
    setWeft(scale ? String(scale.weftPxPerCm) : "");
  }, [scale]);

  const w = parseFloat(warp);
  const f = parseFloat(weft);
  const valid = Number.isFinite(w) && w > 0 && Number.isFinite(f) && f > 0;
  const changed =
    !!scale && valid && (w !== scale.warpPxPerCm || f !== scale.weftPxPerCm);

  return (
    <div className="scale-panel">
      <p className="scale-info">
        {scale ? (
          <>
            当前比例：<b>经向 {scale.warpPxPerCm} px/cm</b> ·{" "}
            <b>纬向 {scale.weftPxPerCm} px/cm</b>
            <span className="scale-meta">
              {scale.by} · {fmtTime(scale.at)} · {scale.reason}
            </span>
          </>
        ) : (
          "尚未标定比例——现在圈出的区域只能记为“待测”，标定后再测量。"
        )}
      </p>
      <div className="scale-form">
        <label>
          <span>经向（纵向）px/cm</span>
          <input
            type="number"
            min="0.1"
            step="0.1"
            placeholder="如 5.2"
            value={warp}
            onChange={(e) => setWarp(e.target.value)}
          />
        </label>
        <label>
          <span>纬向（横向）px/cm</span>
          <input
            type="number"
            min="0.1"
            step="0.1"
            placeholder="如 5.0"
            value={weft}
            onChange={(e) => setWeft(e.target.value)}
          />
        </label>
        <label>
          <span>标定原因</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          disabled={!valid}
          onClick={() => onSave(w, f, reason)}
        >
          {scale ? "保存新比例" : "保存标定"}
        </button>
      </div>
      {changed && (
        <p className="warn-line">
          比例将发生变化，保存后：未复核区域的尺寸标记失效并退回待测；已复核未开工的区域暂停；修复中与已完工的记录保持不变。
        </p>
      )}
    </div>
  );
}
