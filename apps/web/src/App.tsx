import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";

// ─────────────────────────────────────────────────────────────────────────────
// SVG Assets
// ─────────────────────────────────────────────────────────────────────────────

const BubbleSmile = ({ size = 100 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 179 179" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#clip0_smile)">
      <rect width="179" height="179" rx="89.5" fill="#A2E3F6" />
      <path d="M156.244 101.486C147.573 116.332 143.317 136.408 149.998 140.31C156.679 144.212 171.722 123.48 173.694 99.7347C174.955 84.5441 171.858 64.9782 165.177 61.0766C158.496 57.175 164.914 86.6391 156.244 101.486Z" fill="white" />
      <path d="M148.155 42.5957C156.088 51.3372 158.563 56.1309 160.695 54.766C164.91 52.0689 158.979 37.9684 148.272 29.3762C137.235 20.5195 133.602 23.171 132.002 26.9169C130.402 30.6629 140.222 33.8543 148.155 42.5957Z" fill="white" />
      <path d="M138.725 91.7375C138.725 97.9162 133.716 89.5 127.537 89.5C121.359 89.5 116.35 97.9162 116.35 91.7375C116.35 85.5588 121.359 80.55 127.537 80.55C133.716 80.55 138.725 85.5588 138.725 91.7375Z" fill="#222222" />
      <path d="M62.65 91.7375C62.65 97.9162 57.6412 89.5 51.4625 89.5C45.2838 89.5 40.275 97.9162 40.275 91.7375C40.275 85.5588 45.2838 80.55 51.4625 80.55C57.6412 80.55 62.65 85.5588 62.65 91.7375Z" fill="#222222" />
    </g>
    <defs>
      <clipPath id="clip0_smile">
        <rect width="179" height="179" rx="89.5" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

const BubbleSmall = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 179 179" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#clip_sm)">
      <rect width="179" height="179" rx="89.5" fill="#A2E3F6" />
      <path d="M156.244 101.486C147.573 116.332 143.317 136.408 149.998 140.31C156.679 144.212 171.722 123.48 173.694 99.7347C174.955 84.5441 171.858 64.9782 165.177 61.0766C158.496 57.175 164.914 86.6391 156.244 101.486Z" fill="white" />
      <path d="M138.725 91.7375C138.725 97.9162 133.716 89.5 127.537 89.5C121.359 89.5 116.35 97.9162 116.35 91.7375C116.35 85.5588 121.359 80.55 127.537 80.55C133.716 80.55 138.725 85.5588 138.725 91.7375Z" fill="#222222" />
      <path d="M62.65 91.7375C62.65 97.9162 57.6412 89.5 51.4625 89.5C45.2838 89.5 40.275 97.9162 40.275 91.7375C40.275 85.5588 45.2838 80.55 51.4625 80.55C57.6412 80.55 62.65 85.5588 62.65 91.7375Z" fill="#222222" />
    </g>
    <defs>
      <clipPath id="clip_sm">
        <rect width="179" height="179" rx="89.5" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

const NewChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const HistoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.95" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const UploadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);

const DatasetIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

const SqlIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Mode = "Live" | "Regular";
type AppView = "landing" | "swiftquery";

interface PipelineStep {
  id: string;
  label: string;
  status: "idle" | "active" | "done";
}

interface QueryResult {
  sql: string;
  strategy: string;
  strategyReason: string;
  target: string;
  targetMet: boolean;
  targetError: number;
  confidence: number;
  estimate: string;
  relativeError: number;
  elapsed: number;
  dataScanned: number;
  computeSaved: number;
  sampleRows: number;
  exactValue: string;
  delta: string;
  deltaPct: number;
  speedup: number;
  convergencePoints: { x: number; y: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulated pipeline runner
// ─────────────────────────────────────────────────────────────────────────────

async function runSimulatedPipeline(
  prompt: string,
  errorTolerance: number,
  mode: Mode,
  onStep: (step: string) => void,
  onProgress: (pct: number, err: number) => void,
): Promise<QueryResult> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  onStep("sql");
  await delay(600);
  onStep("plan");
  await delay(500);
  onStep("approx");

  const points: { x: number; y: number }[] = [];
  const iterations = mode === "Live" ? 8 : 12;
  for (let i = 1; i <= iterations; i++) {
    await delay(180 + Math.random() * 120);
    const x = Math.round((i / iterations) * 100);
    const y = Math.max(0.5, 35 * Math.exp(-i * 0.38) + (Math.random() - 0.5) * 4);
    points.push({ x, y });
    onProgress(x, y);
    if (y < errorTolerance * 100 && i >= 4) break;
  }

  onStep("exact");
  await delay(800);
  onStep("done");

  const lowerPrompt = prompt.toLowerCase();
  const isRevenue = lowerPrompt.includes("revenue") || lowerPrompt.includes("sales") || lowerPrompt.includes("sum");
  const isCount = lowerPrompt.includes("count") || lowerPrompt.includes("distinct");

  const baseVal = isRevenue ? 124197 : isCount ? 48293 : 73841;
  const exactVal = baseVal + Math.round((Math.random() - 0.5) * 8000);
  const delta = exactVal - baseVal;
  const finalErr = points[points.length - 1]?.y ?? 3.8;
  const scanned = Math.round(15 + Math.random() * 20);

  return {
    sql: isRevenue
      ? "SELECT region, SUM(amount) AS total_sales FROM sales GROUP BY region;"
      : isCount
      ? "SELECT COUNT(DISTINCT user_id) FROM events WHERE event_date > '2024-01-01';"
      : "SELECT AVG(response_time_ms) FROM api_logs WHERE status = 200;",
    strategy: mode === "Live" ? "reservoir_sampling" : "adaptive_sampling",
    strategyReason:
      mode === "Live"
        ? "Live window stream uses reservoir sampling for bounded memory"
        : "Single-table aggregate without GROUP BY fits adaptive sampling",
    target: `within ${errorTolerance * 100}% at ${Math.round(95)}% confidence`,
    targetMet: finalErr < errorTolerance * 100,
    targetError: errorTolerance * 100,
    confidence: 95,
    estimate: isRevenue ? `$${baseVal.toLocaleString()}` : baseVal.toLocaleString(),
    relativeError: +finalErr.toFixed(1),
    elapsed: 2.48,
    dataScanned: scanned,
    computeSaved: 100 - scanned,
    sampleRows: 232799,
    exactValue: isRevenue ? `$${exactVal.toLocaleString()}` : exactVal.toLocaleString(),
    delta: `${Math.abs(delta)}`,
    deltaPct: +(Math.abs(delta / exactVal) * 100).toFixed(1),
    speedup: 4.48,
    convergencePoints: points,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ConvergenceGraph
// ─────────────────────────────────────────────────────────────────────────────

function ConvergenceGraph({
  points,
  targetError,
  animating,
}: {
  points: { x: number; y: number }[];
  targetError: number;
  animating: boolean;
}) {
  const W = 580, H = 240;
  const PAD = { top: 16, right: 20, bottom: 40, left: 46 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxY = Math.max(40, ...points.map((p) => p.y)) * 1.15;

  const toX = (x: number) => PAD.left + (x / 100) * innerW;
  const toY = (y: number) => PAD.top + innerH - (y / maxY) * innerH;

  const pathD = points.length < 2 ? "" : points.map((p, i) =>
    `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)}`
  ).join(" ");

  const targetY = toY(targetError);
  const last = points[points.length - 1];

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((v) => (
        <line
          key={v}
          x1={toX(v)} y1={PAD.top}
          x2={toX(v)} y2={PAD.top + innerH}
          stroke="rgba(255,255,255,0.06)" strokeWidth="1"
        />
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <line
          key={v}
          x1={PAD.left} y1={PAD.top + innerH * (1 - v)}
          x2={PAD.left + innerW} y2={PAD.top + innerH * (1 - v)}
          stroke="rgba(255,255,255,0.06)" strokeWidth="1"
        />
      ))}

      {/* Target threshold line */}
      <line
        x1={PAD.left} y1={targetY}
        x2={PAD.left + innerW} y2={targetY}
        stroke="#FB90B0" strokeWidth="1.2" strokeDasharray="5,4" opacity="0.7"
      />
      <text x={PAD.left + innerW + 4} y={targetY + 4} fill="#FB90B0" fontSize="10" opacity="0.8">
        {targetError}%
      </text>

      {/* Convergence curve */}
      {pathD && (
        <path
          d={pathD}
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.35))" }}
        />
      )}

      {/* Moving dot */}
      {last && (
        <g>
          <circle cx={toX(last.x)} cy={toY(last.y)} r="6" fill="#A2E3F6" stroke="white" strokeWidth="1.5"
            style={animating ? { animation: "dotPulse 1s ease-in-out infinite" } : {}} />
          <rect
            x={toX(last.x) - 22} y={toY(last.y) - 26}
            width="56" height="18" rx="5"
            fill="rgba(30,22,35,0.9)" stroke="rgba(162,227,246,0.5)" strokeWidth="0.8"
          />
          <text x={toX(last.x) + 6} y={toY(last.y) - 14} fill="#ffffff" fontSize="10" textAnchor="middle">
            {last.x}, {last.y.toFixed(1)}
          </text>
        </g>
      )}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

      {/* Axis labels */}
      <text
        x={PAD.left - 8} y={PAD.top + innerH / 2}
        fill="rgba(255,255,255,0.35)" fontSize="10" textAnchor="middle"
        transform={`rotate(-90, ${PAD.left - 28}, ${PAD.top + innerH / 2})`}
      >
        Error Percentage
      </text>
      <text x={PAD.left + innerW / 2} y={H - 6} fill="rgba(255,255,255,0.35)" fontSize="10" textAnchor="middle">
        Data Scanned Percentage
      </text>

      {/* X tick labels */}
      {[0, 25, 50, 75, 100].map((v) => (
        <text key={v} x={toX(v)} y={PAD.top + innerH + 14} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="middle">{v}</text>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlusMenu
// ─────────────────────────────────────────────────────────────────────────────

function PlusMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = [
    { icon: <UploadIcon />, label: "Upload File", desc: "CSV, Parquet, JSON" },
    { icon: <DatasetIcon />, label: "Select Dataset", desc: "Built-in benchmark sets" },
    { icon: <SqlIcon />, label: "Run Raw SQL", desc: "Advanced direct execution" },
  ];

  return (
    <div ref={ref} style={{
      position: "absolute", bottom: "calc(100% + 10px)", left: 0,
      background: "rgba(28,20,33,0.97)", border: "1px solid rgba(251,144,176,0.25)",
      borderRadius: 12, padding: "6px 0", minWidth: 220,
      boxShadow: "0 8px 28px rgba(0,0,0,0.55)", zIndex: 200,
      animation: "menuIn 0.18s cubic-bezier(.22,1,.36,1)",
    }}>
      {items.map((item) => (
        <button key={item.label} onClick={onClose} style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "9px 14px",
          background: "transparent", border: "none", cursor: "pointer",
          color: "#ffffff", textAlign: "left", transition: "background 0.15s",
          fontFamily: "'DM Sans', sans-serif",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(251,144,176,0.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ color: "#FB90B0", flexShrink: 0 }}>{item.icon}</span>
          <span>
            <div style={{ fontWeight: 600, fontSize: 12, letterSpacing: 0.2 }}>{item.label}</div>
            <div style={{ fontSize: 10, color: "#7a6a85", marginTop: 1 }}>{item.desc}</div>
          </span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InputBar
// ─────────────────────────────────────────────────────────────────────────────

function InputBar({
  value, onChange, onSubmit, placeholder = "Ask anything", disabled = false,
}: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  placeholder?: string; disabled?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 740 }}>
      {menuOpen && <PlusMenu onClose={() => setMenuOpen(false)} />}
      <div style={{
        display: "flex", alignItems: "center",
        background: "rgba(255,255,255,0.04)",
        border: "1.5px solid #FB90B0", borderRadius: 999,
        padding: "5px 5px 5px 5px",
        boxShadow: "0 0 20px rgba(251,144,176,0.15)", gap: 7,
      }}>
        <button onClick={() => setMenuOpen((p) => !p)} style={{
          width: 38, height: 38, borderRadius: "50%",
          background: menuOpen ? "rgba(251,144,176,0.2)" : "transparent",
          border: "1.5px solid #FB90B0", color: "#FB90B0",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", flexShrink: 0, transition: "all 0.15s",
        }}>
          <PlusIcon />
        </button>
        <input
          type="text" value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          placeholder={placeholder} disabled={disabled}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "#ffffff", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
            caretColor: "#FB90B0", opacity: disabled ? 0.5 : 1,
          }}
        />
        {value.trim() && !disabled && (
          <button onClick={onSubmit} style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "#FB90B0", border: "none", color: "#1a1320",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0, transition: "all 0.15s",
          }}>
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_HISTORY = [
  "Total revenue by region last quarter",
  "Count distinct users in Jan 2024",
  "Average API response time today",
  "SUM of orders by product category",
  "Top 10 customers by spend",
  "Daily active users last 30 days",
  "Median order value this week",
  "Error rate by service endpoint",
];

function Sidebar({ onNew, onHistory }: { onNew: () => void; onHistory: (p: string) => void }) {
  return (
    <aside style={{
      width: 238, minWidth: 238,
      background: "#222222",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column",
      padding: "30px 0 0 0", zIndex: 10, overflowY: "auto",
    }}>
      <div style={{ padding: "0 20px 24px" }}>
        <span style={{
          fontSize: 26, color: "#FB90B0", letterSpacing: 1, fontWeight: 700,
          textShadow: "0 0 18px rgba(251,144,176,0.4)",
          fontFamily: "'DM Sans', sans-serif",
        }}>Bubble</span>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0 10px" }}>
        {[
          { icon: <NewChatIcon />, label: "New Chat", action: onNew },
          { icon: <SearchIcon />, label: "Search Chats", action: () => { } },
          { icon: <HistoryIcon />, label: "History", action: () => { } },
        ].map(({ icon, label, action }) => (
          <button key={label} onClick={action} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px", background: "rgba(255,255,255,0.04)",
            border: "none", borderRadius: 9, color: "#ffffff",
            cursor: "pointer", fontSize: 13, fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s", textAlign: "left",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251,144,176,0.12)"; e.currentTarget.style.color = "#FB90B0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#ffffff"; }}
          >
            {icon}{label}
          </button>
        ))}
      </nav>

      <div style={{ padding: "18px 10px 0", flex: 1 }}>
        {MOCK_HISTORY.map((h) => (
          <button key={h} onClick={() => onHistory(h)} style={{
            display: "block", width: "100%", textAlign: "left",
            padding: "7px 12px", background: "transparent",
            border: "none", cursor: "pointer", color: "#7a6a85",
            fontSize: 12, lineHeight: 1.45, transition: "color 0.15s",
            fontFamily: "'DM Sans', sans-serif", marginBottom: 2,
          }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#7a6a85")}
          >
            {h}
          </button>
        ))}
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusPanel (right column)
// ─────────────────────────────────────────────────────────────────────────────

function StatusPanel({
  steps, result, streaming,
}: {
  steps: PipelineStep[];
  result: QueryResult | null;
  streaming: boolean;
}) {
  const statusLabel = streaming ? "Result Generating" : result ? "Result Generated" : "Waiting for Prompt";

  const dotStates = steps.filter((s) => s.id !== "done");

  return (
    <aside style={{
      width: 240, minWidth: 240,
      background: "#222222",
      borderLeft: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column",
      padding: "20px 16px", overflowY: "auto", alignItems: "center",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: "#FB90B0",
          marginBottom: 16, textDecoration: "underline",
          fontFamily: "'DM Sans', sans-serif",
        }}>Status</h3>

        {/* Bubble avatar */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ animation: "floatBubble 5s ease-in-out infinite" }}>
            <BubbleSmall size={72} />
          </div>
        </div>

        {/* Status label */}
        <p style={{
          textAlign: "center", fontSize: 13, fontWeight: 600,
          color: "#FB90B0", marginBottom: 14,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {statusLabel}
        </p>

        {/* Pipeline step dots */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 20 }}>
          {dotStates.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: `2px solid ${s.status === "idle" ? "rgba(162,227,246,0.4)" : "#A2E3F6"}`,
                background: s.status === "done" ? "#A2E3F6" : s.status === "active" ? "rgba(162,227,246,0.5)" : "transparent",
                transition: "all 0.3s",
                boxShadow: s.status !== "idle" ? "0 0 6px rgba(162,227,246,0.5)" : "none",
              }} />
              {i < dotStates.length - 1 && (
                <div style={{
                  width: 28, height: 1.5,
                  background: s.status === "done" ? "#A2E3F6" : "rgba(162,227,246,0.2)",
                  borderTop: `1.5px dashed ${s.status === "done" ? "rgba(162,227,246,0.7)" : "rgba(162,227,246,0.25)"}`,
                  margin: "0 1px",
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Result panels */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
            <ResultBlock title="Targets Met">
              <MetricRow label="Target Error" value={`${result.targetError}%`} />
              <MetricRow label="Confidence" value={`${result.confidence}%`} />
              <MetricRow label="Status" value={result.targetMet ? "Achieved" : "Not Met"} highlight={result.targetMet} />
            </ResultBlock>

            <ResultBlock title="Approximate Result">
              <MetricRow label="Estimate" value={result.estimate} />
              <MetricRow label="Relative Error" value={`${result.relativeError}%`} />
              <MetricRow label="Elapsed" value={`${result.elapsed}s`} />
            </ResultBlock>

            <ResultBlock title="Scanned vs Saved">
              <MetricRow label="Data Scanned" value={`${result.dataScanned}%`} />
              <MetricRow label="Compute Saved" value={`${result.computeSaved}%`} />
              <MetricRow label="Sample Rows" value={result.sampleRows.toLocaleString()} />
            </ResultBlock>

            <ResultBlock title="Exact Result">
              <MetricRow label="Exact Value" value={result.exactValue} />
              <MetricRow label="Delta" value={`${result.delta} · ${result.deltaPct}%`} />
              <MetricRow label="Speedup" value={`${result.speedup}x`} />
            </ResultBlock>
          </div>
        )}
      </div>
    </aside>
  );
}

function ResultBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#ffffff", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>
        {title}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{children}</div>
    </div>
  );
}

function MetricRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 11, color: "#7a6a85", fontFamily: "'DM Sans', sans-serif" }}>{label}:</span>
      <span style={{ fontSize: 11, color: highlight ? "#A2E3F6" : "#ffffff", fontWeight: 500, fontFamily: "'DM Sans', sans-serif", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Regular Mode — error % slider popup above input
// ─────────────────────────────────────────────────────────────────────────────

function ErrorSlider({ value, onChange, onClose }: { value: number; onChange: (v: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: "absolute", bottom: "calc(100% + 12px)", left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(28,20,33,0.97)", border: "1px solid rgba(251,144,176,0.25)",
      borderRadius: 14, padding: "16px 20px", minWidth: 260,
      boxShadow: "0 8px 28px rgba(0,0,0,0.55)", zIndex: 200,
      animation: "menuIn 0.18s cubic-bezier(.22,1,.36,1)",
    }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", textAlign: "center", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
        Choose Error Percentage
      </p>
      <p style={{ fontSize: 18, fontWeight: 700, color: "#FB90B0", textAlign: "center", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>
        {Math.round(value * 100)}%
      </p>
      <input
        type="range" min="0.01" max="0.20" step="0.01" value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#FB90B0" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "#7a6a85" }}>−</span>
        <span style={{ fontSize: 10, color: "#7a6a85" }}>+</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing View (home screen with floating bubble)
// ─────────────────────────────────────────────────────────────────────────────

function LandingView({
  onSubmit, mode, errorTolerance, onErrorToleranceChange,
}: {
  onSubmit: (p: string) => void;
  mode: Mode;
  errorTolerance: number;
  onErrorToleranceChange: (v: number) => void;
}) {
  const [input, setInput] = useState("");
  const [showSlider, setShowSlider] = useState(false);

  const handleSubmit = () => {
    if (input.trim()) { onSubmit(input.trim()); setInput(""); }
  };

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 24px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", width: 320, height: 320, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(162,227,246,0.1) 0%, transparent 70%)",
        pointerEvents: "none", animation: "glowPulse 4s ease-in-out infinite",
      }} />

      <div style={{ animation: "floatBubble 5s ease-in-out infinite", marginBottom: 24, zIndex: 1, filter: "drop-shadow(0 10px 28px rgba(162,227,246,0.32))" }}>
        <BubbleSmile size={120} />
      </div>

      <p style={{ color: "#ffffff", fontSize: 16, fontWeight: 500, marginBottom: 28, textAlign: "center", zIndex: 1, fontFamily: "'DM Sans', sans-serif" }}>
        Hello User, What do you wanna know today?
      </p>

      <div style={{ position: "relative", width: "100%", maxWidth: 680, zIndex: 10 }}>
        {mode === "Regular" && showSlider && (
          <ErrorSlider
            value={errorTolerance}
            onChange={onErrorToleranceChange}
            onClose={() => setShowSlider(false)}
          />
        )}
        {mode === "Regular" && (
          <button onClick={() => setShowSlider((p) => !p)} style={{
            position: "absolute", top: -34, right: 0,
            background: "transparent", border: "1px solid rgba(251,144,176,0.35)",
            borderRadius: 8, padding: "4px 12px", color: "#FB90B0",
            fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
          }}>
            Error ±{Math.round(errorTolerance * 100)}%
          </button>
        )}
        <InputBar value={input} onChange={setInput} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SwiftQuery Result View
// ─────────────────────────────────────────────────────────────────────────────

function ResultView({
  result, convergencePoints, animating, targetError, onSubmit, streaming, prompt,
}: {
  result: QueryResult | null;
  convergencePoints: { x: number; y: number }[];
  animating: boolean;
  targetError: number;
  onSubmit: (p: string) => void;
  streaming: boolean;
  prompt: string;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (input.trim()) { onSubmit(input.trim()); setInput(""); }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "80px 32px 8px" }}>
        <div style={{
          border: "1.5px solid rgba(251,144,176,0.4)",
          borderRadius: 16, padding: "20px 22px",
          background: "rgba(255,255,255,0.025)",
          animation: "fadeUp 0.3s ease",
        }}>
          {/* SQL */}
          {(result || streaming) && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
                Generated SQL Query
              </p>
              <div style={{
                background: "rgba(0,0,0,0.35)", borderRadius: 8,
                padding: "10px 14px", fontFamily: "monospace",
                fontSize: 12, color: "#A2E3F6", lineHeight: 1.6,
              }}>
                {result?.sql ?? <span style={{ color: "#5a4f65" }}>Generating...</span>}
              </div>
            </div>
          )}

          {/* Planner rationale */}
          {result && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
                Planner Rationale
              </p>
              <div style={{
                background: "rgba(0,0,0,0.25)", borderRadius: 8,
                padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4,
              }}>
                {[
                  ["Strategy", result.strategy],
                  ["Reason", result.strategyReason],
                  ["Target", result.target],
                ].map(([k, v]) => (
                  <p key={k} style={{ fontSize: 12, color: "#ffffff", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                    <span style={{ fontWeight: 600 }}>{k}:</span> {v}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Convergence graph */}
          {(convergencePoints.length > 0 || result) && (
            <div>
              <ConvergenceGraph
                points={convergencePoints}
                targetError={targetError * 100}
                animating={animating}
              />
            </div>
          )}

          {/* Streaming skeleton */}
          {streaming && convergencePoints.length === 0 && (
            <div style={{
              height: 200, display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, marginTop: 8,
            }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 8, height: 8, borderRadius: "50%", background: "#FB90B0",
                    display: "inline-block",
                    animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "12px 32px 24px", display: "flex", justifyContent: "center" }}>
        <InputBar
          value={input} onChange={setInput} onSubmit={handleSubmit}
          placeholder="Ask a follow-up…" disabled={streaming}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode] = useState<Mode>("Live");
  const [view, setView] = useState<AppView>("landing");
  const [errorTolerance, setErrorTolerance] = useState(0.05);
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [convergencePoints, setConvergencePoints] = useState<{ x: number; y: number }[]>([]);
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: "sql", label: "SQL", status: "idle" },
    { id: "plan", label: "Plan", status: "idle" },
    { id: "approx", label: "Approx", status: "idle" },
    { id: "exact", label: "Exact", status: "idle" },
  ]);

  const updateStep = useCallback((id: string, status: PipelineStep["status"]) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id === id) return { ...s, status };
        if (status === "active" && prev.findIndex((x) => x.id === id) > prev.findIndex((x) => x.id === s.id)) {
          return { ...s, status: "done" };
        }
        return s;
      })
    );
  }, []);

  const handleSubmit = useCallback(async (prompt: string) => {
    setView("swiftquery");
    setResult(null);
    setConvergencePoints([]);
    setStreaming(true);
    setSteps([
      { id: "sql", label: "SQL", status: "idle" },
      { id: "plan", label: "Plan", status: "idle" },
      { id: "approx", label: "Approx", status: "idle" },
      { id: "exact", label: "Exact", status: "idle" },
    ]);

    try {
      const res = await runSimulatedPipeline(
        prompt,
        errorTolerance,
        mode,
        (step) => {
          if (step === "done") {
            setSteps((prev) => prev.map((s) => ({ ...s, status: "done" })));
          } else {
            updateStep(step, "active");
          }
        },
        (pct, err) => {
          setConvergencePoints((prev) => [...prev, { x: pct, y: +err.toFixed(2) }]);
        },
      );
      setResult(res);
    } finally {
      setStreaming(false);
    }
  }, [errorTolerance, mode, updateStep]);

  const handleNew = () => {
    setView("landing");
    setResult(null);
    setConvergencePoints([]);
    setStreaming(false);
    setSteps((prev) => prev.map((s) => ({ ...s, status: "idle" })));
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Alrich', sans-serif; background: #222222; color: #ffffff; height: 100vh; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(251,144,176,0.3); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(251,144,176,0.5); }
        input::placeholder, textarea::placeholder { color: #5a4f65; }
        @keyframes floatBubble { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes glowPulse { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.07)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dotBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-7px)} }
        @keyframes menuIn { from{opacity:0;transform:translateY(6px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes dotPulse { 0%,100%{r:6} 50%{r:8} }
      `}</style>

      <div style={{
        display: "flex", height: "100vh",
        background: "#222222",
        position: "relative",
      }}>
        <Sidebar onNew={handleNew} onHistory={(p) => handleSubmit(p)} />

        {/* Main */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {/* Mode toggle */}
          <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 10, zIndex: 20 }}>
            {(["Live", "Regular"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: "7px 22px", borderRadius: 999,
                border: "1.5px solid",
                borderColor: mode === m ? "#FB90B0" : "rgba(255,255,255,0.22)",
                background: mode === m ? "rgba(251,144,176,0.12)" : "transparent",
                color: mode === m ? "#FB90B0" : "#9a8aaa",
                cursor: "pointer", fontSize: 13, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
              }}
                onMouseEnter={(e) => { if (mode !== m) { e.currentTarget.style.borderColor = "rgba(251,144,176,0.45)"; e.currentTarget.style.color = "#ffffff"; } }}
                onMouseLeave={(e) => { if (mode !== m) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; e.currentTarget.style.color = "#9a8aaa"; } }}
              >
                {m}
              </button>
            ))}
          </div>

          {view === "landing" ? (
            <LandingView
              onSubmit={handleSubmit}
              mode={mode}
              errorTolerance={errorTolerance}
              onErrorToleranceChange={setErrorTolerance}
            />
          ) : (
            <ResultView
              result={result}
              convergencePoints={convergencePoints}
              animating={streaming}
              targetError={errorTolerance}
              onSubmit={handleSubmit}
              streaming={streaming}
              prompt=""
            />
          )}
        </main>

        {/* Status Panel */}
        <StatusPanel steps={steps} result={result} streaming={streaming} />
      </div>
    </>
  );
}