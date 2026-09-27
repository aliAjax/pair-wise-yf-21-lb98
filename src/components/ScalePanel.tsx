import { useState } from "react";
import type { Carpet } from "../storage/archiveStore";
import type { Scale } from "../rules/measurement";

interface CalibrateProps {
  carpet: Carpet;
  onCalibrate: (scale: Scale, by: string) => void;
}

/** 首次定标：录入经纬方向每厘米像素值 */
export function CalibrateForm({ carpet, onCalibrate }: CalibrateProps) {
  const [pxX, setPxX] = useState("");
  const [pxY, setPxY] = useState("");
  const [by, setBy] = useState("");

  if (carpet.scale) return null;

  const submit = () => {
    onCalibrate(
      { pxPerCmX: Number(pxX), pxPerCmY: Number(pxY) },
      by,
    );
  };

  return (
    <div className="scale-form">
      <h3>① 录入比例（首次定标）</h3>
      <p className="muted">
        在纹样图上量出 1 cm 实际长度对应的像素数。手工地毯经纬密度可能不同，两个方向分别填写。
      </p>
      <div className="scale-inputs">
        <label>
          <span>纬向（水平）像素 / cm</span>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={pxX}
            placeholder="如 9.6"
            onChange={(e) => setPxX(e.target.value)}
          />
        </label>
        <label>
          <span>经向（竖直）像素 / cm</span>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={pxY}
            placeholder="如 10.4"
            onChange={(e) => setPxY(e.target.value)}
          />
        </label>
        <label>
          <span>定标师傅</span>
          <input value={by} placeholder="姓名" onChange={(e) => setBy(e.target.value)} />
        </label>
      </div>
      <button className="primary" onClick={submit}>
        保存比例并开始圈选
      </button>
    </div>
  );
}

interface ShrinkProps {
  carpet: Carpet;
  onRescale: (scale: Scale, by: string) => void;
}

/** 清洗缩水重新定标：未复核失效退回待测，已复核未开工暂停，完工保留 */
export function ShrinkForm({ carpet, onRescale }: ShrinkProps) {
  const [open, setOpen] = useState(false);
  const [pxX, setPxX] = useState("");
  const [pxY, setPxY] = useState("");
  const [by, setBy] = useState("");

  if (!carpet.scale) return null;

  const submit = () => {
    onRescale({ pxPerCmX: Number(pxX), pxPerCmY: Number(pxY) }, by);
    setOpen(false);
    setPxX("");
    setPxY("");
    setBy("");
  };

  return (
    <div className="scale-form shrink">
      <div className="scale-current">
        <div>
          <small>当前比例</small>
          <strong>
            纬 {carpet.scale.pxPerCmX} px/cm · 经 {carpet.scale.pxPerCmY} px/cm
          </strong>
        </div>
        <button onClick={() => setOpen((v) => !v)}>
          {open ? "取消" : "清洗缩水 · 重新定标"}
        </button>
      </div>
      {open && (
        <>
          <div className="scale-inputs">
            <label>
              <span>新纬向（水平）像素 / cm</span>
              <input type="number" step="0.1" min="0.1" value={pxX} onChange={(e) => setPxX(e.target.value)} />
            </label>
            <label>
              <span>新经向（竖直）像素 / cm</span>
              <input type="number" step="0.1" min="0.1" value={pxY} onChange={(e) => setPxY(e.target.value)} />
            </label>
            <label>
              <span>执行师傅</span>
              <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="姓名" />
            </label>
          </div>
          <ul className="shrink-rules">
            <li>未复核区域：尺寸标记失效，退回待测，需按新比例重测；</li>
            <li>已复核但未开工：暂停挂起，重测并再次复核后才能开工；</li>
            <li>补线中、已完工：记录原样保留。</li>
          </ul>
          <button className="danger" onClick={submit}>
            应用新比例（操作会作废相关尺寸标记）
          </button>
        </>
      )}
      {carpet.scaleHistory.length > 0 && (
        <details className="scale-history">
          <summary>定标记录（{carpet.scaleHistory.length} 次）</summary>
          <ol>
            {[...carpet.scaleHistory].reverse().map((e, i) => (
              <li key={i}>
                {new Date(e.at).toLocaleString()} · {e.source === "shrink" ? "缩水重标" : "首次定标"} ·
                纬 {e.pxPerCmX} / 经 {e.pxPerCmY} px/cm · {e.by}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
