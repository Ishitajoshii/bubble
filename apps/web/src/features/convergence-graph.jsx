import { useState, useEffect, useRef, useCallback } from "react";
import BubbleStraight from "../../../../Bubble straight.svg";

// ─────────────────────────────────────────────────────────────────────────────
// Colour palette — deep-space cyan / teal / indigo
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:          "#04070f",
  surface:     "#080d1a",
  card:        "#09101e",
  border:      "#0f1c30",
  borderHi:    "#172540",
  grid:        "#0b1422",

  cyan:        "#22d3ee",
  cyanDim:     "rgba(34,211,238,0.18)",
  teal:        "#2dd4bf",
  tealDim:     "rgba(45,212,191,0.15)",
  purple:      "#818cf8",
  purpleDim:   "rgba(129,140,248,0.18)",
  indigo:      "#6366f1",

  text:        "#c8d8f0",
  textMid:     "#5a7090",
  textDim:     "#2a3a52",

  // aurora ribbon colours
  aurora1:     "rgba(34,211,238,0.07)",
  aurora2:     "rgba(99,102,241,0.06)",
};

// Constants
const TARGET_ERROR = 5;
const W   = 640;
const H   = 300;
const PAD = { top: 32, right: 36, bottom: 52, left: 56 };
const MAX_ERR = 60;
const LERP_SPEED = 0.072; // fraction per frame — controls smoothness

// Helpers
const sx = pct  => PAD.left + (pct / 100) * (W - PAD.left - PAD.right);
const sy = err  => { const r = H - PAD.top - PAD.bottom; return PAD.top + r - (err / MAX_ERR) * r; };
const lerp = (a, b, t) => a + (b - a) * t;

function generatePoints() {
  const pts = [];
  let err = 46 + Math.random() * 12;
  for (let i = 0; i < 20; i++) {
    const scanned = parseFloat(((i + 1) * (93 / 20)).toFixed(1));
    err = Math.max(1.0, err * (0.68 + Math.random() * 0.16));
    pts.push({
      iteration: i + 1,
      data_scanned_pct: scanned,
      relative_error: parseFloat(err.toFixed(2)),
      elapsed_ms: ((i + 1) * (50 + Math.random() * 50)) | 0,
    });
  }
  return pts;
}

// Build smooth cubic-bezier SVG path from array of {x,y}
function smoothPath(coords) {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const p = coords[i - 1], c = coords[i];
    const cpx = (p.x + c.x) / 2;
    d += ` C ${cpx} ${p.y}, ${cpx} ${c.y}, ${c.x} ${c.y}`;
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function ConvergenceGraph() {
  const allPts  = useRef(generatePoints());
  const [revealed, setRevealed] = useState([]);
  const [running,  setRunning]  = useState(false);
  const [done,     setDone]     = useState(false);
  const tickRef    = useRef(null);
  const rafRef     = useRef(null);
  const svgRef     = useRef(null);
  const [hovered,  setHovered]  = useState(null);

  // Smooth interpolated bubble position
  const bubTarget  = useRef({ x: sx(5), y: sy(MAX_ERR * 0.7) });
  const bubCurrent = useRef({ x: sx(5), y: sy(MAX_ERR * 0.7) });
  const [bubPos,   setBubPos]   = useState(bubCurrent.current);

  // Smooth interpolated path coords
  const pathTarget  = useRef([]);
  const pathCurrent = useRef([]);
  const [pathCoords, setPathCoords] = useState([]);

  const targetMetIdx = revealed.findIndex(p => p.relative_error <= TARGET_ERROR);
  const current      = revealed[revealed.length - 1] ?? null;
  const targetMet    = targetMetIdx !== -1;

  // ── RAF animation loop ────────────────────────────────────────────────────
  useEffect(() => {
    function frame() {
      let dirty = false;

      // Interpolate bubble
      const tx = bubTarget.current.x, ty = bubTarget.current.y;
      const cx = bubCurrent.current.x, cy = bubCurrent.current.y;
      const nx = lerp(cx, tx, LERP_SPEED);
      const ny = lerp(cy, ty, LERP_SPEED);
      if (Math.abs(nx - cx) > 0.05 || Math.abs(ny - cy) > 0.05) {
        bubCurrent.current = { x: nx, y: ny };
        setBubPos({ x: nx, y: ny });
        dirty = true;
      }

      // Interpolate each path coord
      const tCoords = pathTarget.current;
      const cCoords = pathCurrent.current;
      if (tCoords.length > 0) {
        // Grow array if needed
        while (cCoords.length < tCoords.length) {
          // New point starts at previous last position
          const last = cCoords[cCoords.length - 1] ?? tCoords[0];
          cCoords.push({ x: last.x, y: last.y });
        }
        let moved = false;
        for (let i = 0; i < cCoords.length; i++) {
          const tnx = lerp(cCoords[i].x, tCoords[i].x, LERP_SPEED * 1.4);
          const tny = lerp(cCoords[i].y, tCoords[i].y, LERP_SPEED * 1.4);
          if (Math.abs(tnx - cCoords[i].x) > 0.05 || Math.abs(tny - cCoords[i].y) > 0.05) {
            cCoords[i] = { x: tnx, y: tny };
            moved = true;
          }
        }
        if (moved) { setPathCoords([...cCoords]); dirty = true; }
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Tick: reveal one point at a time ─────────────────────────────────────
  const tick = useCallback(() => {
    setRevealed(prev => {
      if (prev.length >= allPts.current.length) {
        setRunning(false); setDone(true);
        clearInterval(tickRef.current);
        return prev;
      }
      const next = [...prev, allPts.current[prev.length]];

      // Update targets for RAF loop
      const newPt = next[next.length - 1];
      bubTarget.current = { x: sx(newPt.data_scanned_pct), y: sy(newPt.relative_error) };
      pathTarget.current = next.map(p => ({ x: sx(p.data_scanned_pct), y: sy(p.relative_error) }));

      return next;
    });
  }, []);

  useEffect(() => {
    if (running) tickRef.current = setInterval(tick, 900);
    else         clearInterval(tickRef.current);
    return ()  => clearInterval(tickRef.current);
  }, [running, tick]);

  function handleReset() {
    clearInterval(tickRef.current);
    allPts.current = generatePoints();
    const start = { x: sx(5), y: sy(MAX_ERR * 0.7) };
    bubTarget.current  = start;
    bubCurrent.current = start;
    pathTarget.current  = [];
    pathCurrent.current = [];
    setRevealed([]); setRunning(false); setDone(false);
    setHovered(null); setPathCoords([]); setBubPos(start);
  }

  // ── Hover ─────────────────────────────────────────────────────────────────
  function handleMouseMove(e) {
    if (!revealed.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx   = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = null, minD = Infinity;
    for (const p of revealed) {
      const d = Math.abs(sx(p.data_scanned_pct) - mx);
      if (d < minD) { minD = d; nearest = p; }
    }
    if (nearest && minD < 36)
      setHovered({ x: sx(nearest.data_scanned_pct), y: sy(nearest.relative_error), point: nearest });
    else setHovered(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const targetY   = sy(TARGET_ERROR);
  const yTicks    = [0, 15, 30, 45, 60];
  const xTicks    = [0, 25, 50, 75, 100];
  const linePath  = smoothPath(pathCoords);
  const areaPath  = pathCoords.length >= 2
    ? linePath
      + ` L ${pathCoords.at(-1).x} ${H - PAD.bottom}`
      + ` L ${pathCoords[0].x} ${H - PAD.bottom} Z`
    : "";

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── Ambient background orbs ── */}
      <div style={S.orb1}/>
      <div style={S.orb2}/>

      <div style={S.wrapper}>
        {/* Header */}
        <div style={S.header}>
          <div style={{ animation: "fadeUp 0.6s ease both" }}>
            <div style={S.eyebrow}>SwiftQuery  ·  Convergence</div>
            <h2 style={S.title}>Error Convergence</h2>
            <div style={S.subtitle}>Approximate error as a function of data scanned</div>
          </div>
          <StatusBadge running={running} done={done} targetMet={targetMet} />
        </div>

        {/* Chart */}
        <div style={S.card}>
          {/* Top shimmer border */}
          <div style={S.cardTopBorder}/>

          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={S.svg}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)}>
            <defs>
              {/* Bubble glow */}
              <filter id="glow" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="9" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              {/* Soft glow for line */}
              <filter id="lineGlow" x="-20%" y="-60%" width="140%" height="220%">
                <feGaussianBlur stdDeviation="3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              {/* Area gradient */}
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={targetMet ? C.teal : C.cyan} stopOpacity="0.18"/>
                <stop offset="55%"  stopColor={targetMet ? C.teal : C.cyan} stopOpacity="0.04"/>
                <stop offset="100%" stopColor={targetMet ? C.teal : C.cyan} stopOpacity="0"/>
              </linearGradient>
              {/* Second aurora layer */}
              <linearGradient id="auroraGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={C.indigo} stopOpacity="0.09"/>
                <stop offset="100%" stopColor={C.indigo} stopOpacity="0"/>
              </linearGradient>
              <clipPath id="clip">
                <rect x={PAD.left} y={PAD.top} width={W-PAD.left-PAD.right} height={H-PAD.top-PAD.bottom}/>
              </clipPath>
            </defs>

            {/* Grid */}
            {yTicks.map(v => (
              <line key={v} x1={PAD.left} x2={W-PAD.right}
                y1={sy(v)} y2={sy(v)} stroke={C.grid} strokeWidth="1"/>
            ))}
            {xTicks.map(v => (
              <line key={v} x1={sx(v)} x2={sx(v)}
                y1={PAD.top} y2={H-PAD.bottom} stroke={C.grid} strokeWidth="1"/>
            ))}

            {/* Y labels */}
            {yTicks.map(v => (
              <text key={v} x={PAD.left - 10} y={sy(v) + 4}
                textAnchor="end" fill={C.textDim} fontSize="10" fontFamily="DM Mono">{v}%</text>
            ))}
            {/* X labels */}
            {xTicks.map(v => (
              <text key={v} x={sx(v)} y={H - PAD.bottom + 18}
                textAnchor="middle" fill={C.textDim} fontSize="10" fontFamily="DM Mono">{v}%</text>
            ))}
            {/* Axis titles */}
            <text x={W/2} y={H - 4} textAnchor="middle" fill={C.textMid} fontSize="10" fontFamily="DM Mono">
              Data Scanned (%)
            </text>
            <text x={13} y={H/2} textAnchor="middle" fill={C.textMid} fontSize="10" fontFamily="DM Mono"
              transform={`rotate(-90,13,${H/2})`}>Error (%)</text>

            <g clipPath="url(#clip)">
              {/* Target threshold — purple dashed */}
              <line x1={PAD.left} x2={W-PAD.right} y1={targetY} y2={targetY}
                stroke={C.purple} strokeWidth="1" strokeDasharray="5,5" opacity="0.45"/>
              <text x={W - PAD.right - 4} y={targetY - 6}
                textAnchor="end" fill={C.purple} fontSize="9" fontFamily="DM Mono" opacity="0.7">
                5% target
              </text>

              {/* Safe zone */}
              <rect x={PAD.left} y={targetY}
                width={W-PAD.left-PAD.right} height={H-PAD.bottom-targetY}
                fill={targetMet ? "rgba(45,212,191,0.04)" : "rgba(129,140,248,0.025)"}
                style={{ transition: "fill 1s" }}/>

              {/* Aurora fill layers */}
              {areaPath && <>
                <path d={areaPath} fill="url(#auroraGrad)"/>
                <path d={areaPath} fill="url(#areaGrad)" style={{ transition: "fill 0.8s" }}/>
              </>}

              {/* Glowing line shadow */}
              {linePath && (
                <path d={linePath} fill="none"
                  stroke={targetMet ? C.teal : C.cyan}
                  strokeWidth="4" strokeLinecap="round"
                  strokeDasharray="8,5"
                  opacity="0.18"
                  filter="url(#lineGlow)"/>
              )}

              {/* Main dashed error curve */}
              {linePath && (
                <path d={linePath} fill="none"
                  stroke={targetMet ? C.teal : C.cyan}
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="8,5"
                  style={{ transition: "stroke 0.8s" }}/>
              )}

              {/* Ghost trail dots */}
              {revealed.map((p, i) => {
                if (i === revealed.length - 1) return null;
                const col = targetMet ? "45,212,191" : "34,211,238";
                const opacity = 0.1 + (i / revealed.length) * 0.2;
                return (
                  <circle key={i}
                    cx={sx(p.data_scanned_pct)} cy={sy(p.relative_error)}
                    r="1.8" fill={`rgba(${col},${opacity})`}/>
                );
              })}

              {/* Bubble straight SVG marker */}
              {revealed.length > 0 && (
                <g filter="url(#glow)">
                  <image
                    href={BubbleStraight}
                    x={bubPos.x - 20} y={bubPos.y - 20}
                    width={40} height={40}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ filter: targetMet ? "drop-shadow(0 0 10px rgba(45,212,191,0.7))" : "drop-shadow(0 0 10px rgba(34,211,238,0.7))" }}
                  />
                  {/* Error label */}
                  <text x={bubPos.x} y={bubPos.y - 32}
                    textAnchor="middle"
                    fill={targetMet ? C.teal : C.cyan}
                    fontSize="11" fontFamily="DM Mono" fontWeight="500" opacity="0.95"
                    style={{ transition: "fill 0.6s" }}>
                    {current?.relative_error}%
                  </text>
                </g>
              )}

              {/* Hover pip + tooltip */}
              {hovered && hovered.point !== current && (
                <g>
                  <circle cx={hovered.x} cy={hovered.y} r="4"
                    fill={C.surface} stroke={`rgba(34,211,238,0.55)`} strokeWidth="1.5"/>
                  <line x1={hovered.x} x2={hovered.x} y1={hovered.y} y2={H-PAD.bottom}
                    stroke="rgba(34,211,238,0.12)" strokeWidth="1" strokeDasharray="3,3"/>
                  <g transform={`translate(${Math.min(hovered.x+14, W-PAD.right-138)},${Math.max(hovered.y-62, PAD.top)})`}>
                    <rect rx="8" ry="8" width="134" height="56"
                      fill={C.card} stroke={C.borderHi} strokeWidth="1" opacity="0.97"/>
                    <text x="11" y="17" fill={C.textMid}  fontSize="9"  fontFamily="DM Mono">ITER {hovered.point.iteration}</text>
                    <text x="11" y="31" fill={C.text}     fontSize="11" fontFamily="DM Mono" fontWeight="500">
                      Error: {hovered.point.relative_error}%
                    </text>
                    <text x="11" y="46" fill={C.textDim}  fontSize="9"  fontFamily="DM Mono">
                      {hovered.point.elapsed_ms}ms · {hovered.point.data_scanned_pct}% scanned
                    </text>
                  </g>
                </g>
              )}
            </g>

            {/* Target-met marker */}
            {targetMet && (
              <g>
                <line
                  x1={sx(revealed[targetMetIdx].data_scanned_pct)}
                  x2={sx(revealed[targetMetIdx].data_scanned_pct)}
                  y1={PAD.top} y2={H - PAD.bottom}
                  stroke="rgba(45,212,191,0.22)" strokeWidth="1" strokeDasharray="3,4"/>
                <text
                  x={sx(revealed[targetMetIdx].data_scanned_pct) + 6}
                  y={PAD.top + 14}
                  fill="rgba(45,212,191,0.65)" fontSize="9" fontFamily="DM Mono" letterSpacing="0.08em">
                  TARGET MET
                </text>
              </g>
            )}
          </svg>

          {/* Legend */}
          <div style={S.legend}>
            <LegendLine color={C.cyan}   label="Error %" />
            <LegendLine color={C.purple} label="5% Threshold" />
            <LegendBubbleMini met={targetMet} />
          </div>
        </div>

        {/* Stats */}
        <div style={S.statsRow}>
          <StatCard label="Scanned"      value={current ? `${current.data_scanned_pct}%`                  : "—"} sub="of dataset"    bar={C.cyan}   />
          <StatCard label="Saved"        value={current ? `${(100-current.data_scanned_pct).toFixed(1)}%` : "—"} sub="computation"   bar={C.teal}   />
          <StatCard label="Error"        value={current ? `${current.relative_error}%`                    : "—"} sub="relative"      bar={targetMet ? C.teal : C.indigo} />
          <StatCard label="Elapsed"      value={current ? `${current.elapsed_ms}ms`                       : "—"} sub="approx time"   bar={C.textDim}/>
          <StatCard label="Iteration"    value={current ? `${current.iteration} / 20`                     : "—"} sub="progress"      bar={C.purple} />
        </div>

        {/* Controls */}
        <div style={S.controls}>
          <Btn primary onClick={() => {
            if (done) { handleReset(); setTimeout(() => setRunning(true), 60); }
            else setRunning(r => !r);
          }}>
            {done ? "↺  Rerun" : running ? "⏸  Pause" : "▶  Run Query"}
          </Btn>
          <Btn onClick={handleReset}>↺  Reset</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ running, done, targetMet }) {
  const col    = targetMet ? C.teal : running ? C.cyan : C.textMid;
  const border = targetMet ? "rgba(45,212,191,0.3)" : running ? "rgba(34,211,238,0.25)" : "rgba(90,112,144,0.25)";
  const bg     = targetMet ? "rgba(45,212,191,0.06)" : running ? "rgba(34,211,238,0.05)" : "rgba(90,112,144,0.05)";
  const label  = targetMet ? "TARGET MET" : running ? "SCANNING" : done ? "COMPLETE" : "IDLE";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, color:col, background:bg,
      border:`1px solid ${border}`, borderRadius:24, padding:"6px 14px",
      fontFamily:"DM Mono", fontSize:"0.65rem", letterSpacing:"0.1em",
      animation: "fadeUp 0.6s 0.15s ease both", opacity:0 }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:col, flexShrink:0,
        animation: running ? "blink 1.4s ease-in-out infinite" : "none" }}/>
      {label}
    </div>
  );
}

function StatCard({ label, value, sub, bar }) {
  return (
    <div style={S.statCard}>
      <div style={{ ...S.statBar, background: bar }}/>
      <div style={S.statLabel}>{label}</div>
      <div style={S.statValue}>{value}</div>
      <div style={S.statSub}>{sub}</div>
    </div>
  );
}

function LegendLine({ color, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, color:C.textMid, fontSize:"0.68rem", fontFamily:"DM Mono" }}>
      <svg width="26" height="10">
        <line x1="0" y1="5" x2="26" y2="5" stroke={color} strokeWidth="1.5" strokeDasharray="6,4"/>
      </svg>
      {label}
    </div>
  );
}

function LegendBubbleMini({ met }) {
  const col = met ? "45,212,191" : "34,211,238";
  const solid = met ? C.teal : C.cyan;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, color:C.textMid, fontSize:"0.68rem", fontFamily:"DM Mono" }}>
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r="8" fill={`rgba(${col},0.06)`} stroke={`rgba(${col},0.5)`} strokeWidth="1.4"/>
        <ellipse cx="8.4" cy="8.6" rx="2.5" ry="1.3" fill="rgba(255,255,255,0.22)" transform="rotate(-32,8.4,8.6)"/>
        <circle cx="11" cy="11" r="2" fill={solid} opacity="0.8"/>
      </svg>
      Current Point
    </div>
  );
}

function Btn({ children, primary, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: primary ? "rgba(34,211,238,0.07)" : C.surface,
      border: `1px solid ${primary ? "rgba(34,211,238,0.35)" : C.border}`,
      color: primary ? C.cyan : C.textMid,
      padding: "9px 22px", borderRadius: 10,
      fontFamily: "DM Mono", fontSize: "0.7rem", letterSpacing: "0.05em", cursor: "pointer",
      transition: "all 0.2s",
    }}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  page: {
    position: "relative", minHeight: "100vh",
    background: C.bg, overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  // Ambient background orbs
  orb1: {
    position:"absolute", top:"-18%", left:"-12%",
    width:520, height:520, borderRadius:"50%",
    background:"radial-gradient(circle, rgba(34,211,238,0.055) 0%, transparent 70%)",
    pointerEvents:"none",
  },
  orb2: {
    position:"absolute", bottom:"-20%", right:"-10%",
    width:480, height:480, borderRadius:"50%",
    background:"radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)",
    pointerEvents:"none",
  },
  wrapper: {
    position:"relative", zIndex:1,
    width:"100%", maxWidth:820,
    display:"flex", flexDirection:"column", gap:18,
    padding:"36px 28px",
    fontFamily:"'DM Mono', monospace",
  },
  header: {
    display:"flex", alignItems:"flex-start",
    justifyContent:"space-between", flexWrap:"wrap", gap:14,
  },
  eyebrow: {
    fontFamily:"DM Mono", fontSize:"0.6rem",
    letterSpacing:"0.22em", textTransform:"uppercase",
    color: C.cyan, marginBottom:7, opacity:0.8,
  },
  title: {
    fontFamily:"'Syne', sans-serif", fontSize:"1.5rem",
    fontWeight:700, letterSpacing:"-0.02em", color: C.text, lineHeight:1.15,
  },
  subtitle: {
    fontFamily:"DM Mono", fontSize:"0.68rem",
    color: C.textMid, marginTop:5, letterSpacing:"0.02em",
  },
  card: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 16, padding:"22px 22px 16px",
    position:"relative", overflow:"hidden",
    boxShadow:"0 0 0 1px rgba(34,211,238,0.04), 0 32px 64px rgba(0,0,0,0.5)",
  },
  cardTopBorder: {
    position:"absolute", top:0, left:"10%", right:"10%", height:1,
    background:"linear-gradient(90deg,transparent,rgba(34,211,238,0.3),rgba(99,102,241,0.2),transparent)",
    borderRadius:1,
  },
  svg: { width:"100%", height:"auto", display:"block", cursor:"crosshair" },
  legend: { display:"flex", gap:22, alignItems:"center", marginTop:12, flexWrap:"wrap" },
  statsRow: {
    display:"grid",
    gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",
    gap:12,
  },
  statCard: {
    background: C.surface, border:`1px solid ${C.border}`,
    borderRadius:12, padding:"14px 16px",
    position:"relative", overflow:"hidden",
  },
  statBar: {
    position:"absolute", bottom:0, left:0, right:0,
    height:"2px", borderRadius:"0 0 12px 12px",
  },
  statLabel: {
    fontFamily:"DM Mono", fontSize:"0.58rem",
    letterSpacing:"0.14em", textTransform:"uppercase",
    color: C.textDim, marginBottom:7,
  },
  statValue: {
    fontFamily:"'Syne', sans-serif", fontSize:"1.2rem",
    fontWeight:600, color: C.text, transition:"color 0.4s",
  },
  statSub: { fontSize:"0.65rem", color: C.textDim, marginTop:3, fontFamily:"DM Mono" },
  controls: { display:"flex", gap:10, flexWrap:"wrap" },
};