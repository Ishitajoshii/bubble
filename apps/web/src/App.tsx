import { useEffect, useRef, useState, type FormEvent } from "react";
import "./App.css";
import BubbleSmileSvg from "./components/mascot/Bubble smile.svg";

import {
  createQuerySessionClient,
  type QuerySessionRun,
} from "./lib/api";
import {
  formatDuration,
  formatFractionAsPercent,
  formatInteger,
  formatPercent,
} from "./lib/format";
import { mockCreateQuerySessionRequest } from "./mocks/query-session";
import type {
  AnyQuerySessionEvent,
  ApproxProgressPayload,
  DatasetSummary,
  QuerySessionEvent,
  QuerySessionEventType,
} from "./types/query";

const queryClient = createQuerySessionClient();

type AppMode = "live" | "regular";

const HISTORY_ITEMS = [
  "Lorem ipsum dolor sit amet, consectetur.",
  "Lorem ipsum dolor sit amet, consectetur.",
  "Lorem ipsum dolor sit amet, consectetur.",
  "Lorem ipsum dolor sit amet, consectetur.",
  "Lorem ipsum dolor sit amet, consectetur.",
  "Lorem ipsum dolor sit amet, consectetur.",
  "Lorem ipsum dolor sit amet, consectetur.",
  "Lorem ipsum dolor sit amet, consectetur.",
];

export default function App() {
  const activeRunRef = useRef<QuerySessionRun | null>(null);

  const [mode, setMode] = useState<AppMode>("live");
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetId, setDatasetId] = useState(
    mockCreateQuerySessionRequest.dataset_id
  );
  const [prompt, setPrompt] = useState("");
  const [errorTolerance, setErrorTolerance] = useState(0);
  const [confidenceLevel, setConfidenceLevel] = useState(
    mockCreateQuerySessionRequest.confidence_level
  );
  const [events, setEvents] = useState<AnyQuerySessionEvent[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [showErrorSlider, setShowErrorSlider] = useState(false);
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    let disposed = false;

    async function loadDatasets() {
      setIsLoadingDatasets(true);
      try {
        const items = await queryClient.listDatasets();
        if (disposed) return;
        setDatasets(items);
        if (items.length > 0 && !items.some((item) => item.dataset_id === datasetId)) {
          setDatasetId(items[0].dataset_id);
        }
      } catch (error) {
        if (!disposed) {
          setUiError(error instanceof Error ? error.message : "Failed to load datasets.");
        }
      } finally {
        if (!disposed) setIsLoadingDatasets(false);
      }
    }

    void loadDatasets();

    return () => {
      disposed = true;
      activeRunRef.current?.stop();
    };
  }, []);

  const sqlEvent = getLastEventByType(events, "sql_generated");
  const planEvent = getLastEventByType(events, "plan_ready");
  const approxProgressEvents = getEventsByType(events, "approx_progress");
  const approxFinalEvent = getLastEventByType(events, "approx_final");
  const exactResultEvent = getLastEventByType(events, "exact_result");
  const latestMetric =
    approxFinalEvent?.payload ?? lastItem(approxProgressEvents)?.payload ?? null;
  const planner = planEvent?.payload.planner ?? null;
  const exactResult = exactResultEvent?.payload ?? null;

  async function handleSubmit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!prompt.trim() || isStreaming) return;

    activeRunRef.current?.stop();
    activeRunRef.current = null;
    setUiError(null);
    setEvents([]);
    setSessionId(null);
    setIsStreaming(true);
    setHasResult(false);
    setShowErrorSlider(false);

    try {
      const run = await queryClient.startSession(
        {
          prompt,
          dataset_id: datasetId,
          live_mode: mode === "live",
          error_tolerance: errorTolerance,
          confidence_level: confidenceLevel,
        },
        {
          onEvent(streamEvent) {
            setEvents((current) => [...current, streamEvent]);
            if (streamEvent.type === "error") {
              setUiError(streamEvent.payload.message);
            }
            if (streamEvent.type === "exact_result") {
              setHasResult(true);
            }
          },
          onError(error) {
            setUiError(error.message);
            setIsStreaming(false);
            activeRunRef.current = null;
          },
          onComplete() {
            setIsStreaming(false);
            setHasResult(true);
            activeRunRef.current = null;
          },
        }
      );

      activeRunRef.current = run;
      setSessionId(run.sessionId);
      void run.done.catch(() => undefined);
    } catch (error) {
      setUiError(
        error instanceof Error ? error.message : "Failed to start query session."
      );
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const statusLabel = hasResult
    ? "Result Generated"
    : isStreaming
    ? "Processing..."
    : "Waiting for Prompt";

  // Stage: 0 = waiting, 1 = processing, 2 = done
  const stage = hasResult ? 2 : isStreaming ? 1 : 0;

  return (
    <div className="bubble-app">
      {/* ── Sidebar ── */}
      <aside className="bubble-sidebar">
        <div className="bubble-logo">Bubble</div>
        <nav className="bubble-nav">
          <button className="bubble-nav-btn">
            <BubbleIcon type="chat" />
            New Chat
          </button>
          <button className="bubble-nav-btn">
            <BubbleIcon type="search" />
            Search Chats
          </button>
          <button className="bubble-nav-btn">
            <BubbleIcon type="history" />
            History
          </button>
        </nav>
        <ul className="bubble-history">
          {HISTORY_ITEMS.map((item, i) => (
            <li key={i} className="bubble-history-item">
              {item}
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Main ── */}
      <main className="bubble-main">
        {/* Mode toggle */}
        <div className="bubble-mode-toggle">
          <button
            className={`bubble-mode-btn ${mode === "live" ? "active" : ""}`}
            onClick={() => setMode("live")}
          >
            Live
          </button>
          <button
            className={`bubble-mode-btn ${mode === "regular" ? "active" : ""}`}
            onClick={() => setMode("regular")}
          >
            Regular
          </button>
        </div>

        {/* Content area */}
        <div className="bubble-content">
          {uiError && (
            <div className="bubble-error">{uiError}</div>
          )}

          {hasResult || isStreaming ? (
            <ResultPanel
              mode={mode}
              sqlEvent={sqlEvent}
              planner={planner}
              latestMetric={latestMetric}
              approxProgressEvents={approxProgressEvents}
            />
          ) : null}
        </div>

        {/* Slider popup — shown above input bar when toggled in regular mode */}
        {showErrorSlider && mode === "regular" && (
          <div className="bubble-slider-popup">
            <p className="bubble-slider-label">Choose Error Percentage</p>
            <p className="bubble-slider-value">{Math.round(errorTolerance * 100)}%</p>
            <div className="bubble-slider-row">
              <button
                className="bubble-slider-stepper"
                onClick={() => setErrorTolerance(Math.max(0, errorTolerance - 0.01))}
              >
                −
              </button>
              <input
                type="range"
                min="0"
                max="1.00"
                step="0.01"
                value={errorTolerance}
                onChange={(e) => setErrorTolerance(Number(e.target.value))}
                className="bubble-range"
              />
              <button
                className="bubble-slider-stepper"
                onClick={() => setErrorTolerance(Math.min(1, errorTolerance + 0.01))}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Input bar */}
        <form className="bubble-input-bar" onSubmit={handleSubmit}>
          <button
            type="button"
            className="bubble-plus-btn"
            onClick={() => setShowErrorSlider((v) => !v)}
            title="Configure error tolerance"
          >
            +
          </button>
          <textarea
            className="bubble-input"
            placeholder="Ask anything"
            value={prompt}
            rows={1}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </form>
      </main>

      {/* ── Right Panel ── */}
      <aside className="bubble-right">
        <h2 className="bubble-status-title">Status</h2>

        {/* Bubble smile avatar */}
        <img src={BubbleSmileSvg} alt="Bubble" className="bubble-smile-svg" />

        <p className={`bubble-status-label ${hasResult ? "done" : ""}`}>
          {statusLabel}
        </p>

        {/* Step indicator */}
        <StepIndicator stage={stage} />

        {/* Result sections — only shown after result */}
        {hasResult && latestMetric && (
          <div className="bubble-metrics">
            <MetricSection title="Targets Met">
              {mode === "live" ? (
                <>
                  <MetricRow label="Target Error: 10%" value="Confidence: 90%" />
                  <MetricRow label="Target Error: 5%" value="Confidence: 95%" />
                  <MetricRow label="Target Error: 3%" value="Confidence: 97%" />
                  <MetricRow label="Target Error: 1%" value="Confidence: 99%" />
                </>
              ) : (
                <>
                  <MetricRow label="Target Error" value={formatPercent(latestMetric.target_error_pct)} />
                  <MetricRow label="Confidence" value={formatFractionAsPercent(latestMetric.confidence_level)} />
                </>
              )}
              <MetricRow
                label="Status"
                value={latestMetric.target_met ? "Achieved" : "In progress"}
              />
            </MetricSection>

            <MetricSection title="Approximate Result">
              <MetricRow label="Estimate" value={latestMetric.display_value} />
              <MetricRow label="Relative Error" value={formatFractionAsPercent(latestMetric.relative_error)} />
              <MetricRow label="Elapsed" value={formatDuration(latestMetric.elapsed_ms)} />
            </MetricSection>

            <MetricSection title="Scanned vs Saved">
              <MetricRow label="Data Scanned" value={formatPercent(latestMetric.data_scanned_pct)} />
              <MetricRow label="Compute Saved" value={formatPercent(latestMetric.compute_saved_pct)} />
              <MetricRow label="Sample Rows" value={formatInteger(latestMetric.sample_rows)} />
            </MetricSection>

            {exactResult && (
              <MetricSection title="Exact Result">
                <MetricRow label="Exact Value" value={exactResult.display_value} />
                <MetricRow
                  label="Delta"
                  value={`${exactResult.delta} · ${formatFractionAsPercent(exactResult.delta_pct)}`}
                />
                <MetricRow label="Speedup" value={`${exactResult.speedup.toFixed(2)}x`} />
              </MetricSection>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ stage }: { stage: number }) {
  return (
    <div className="bubble-step-indicator">
      <div className={`bubble-step-dot ${stage >= 0 ? "active" : ""}`} />
      <div className={`bubble-step-line ${stage >= 1 ? "active" : ""}`} />
      <div className={`bubble-step-dot ${stage >= 1 ? "active" : ""}`} />
      <div className={`bubble-step-line ${stage >= 2 ? "active" : ""}`} />
      <div className={`bubble-step-dot ${stage >= 2 ? "active" : ""}`} />
    </div>
  );
}

// ── Result Panel ─────────────────────────────────────────────────────────────

function ResultPanel({
  mode,
  sqlEvent,
  planner,
  latestMetric,
  approxProgressEvents,
}: {
  mode: "live" | "regular";
  sqlEvent: QuerySessionEvent<"sql_generated"> | undefined;
  planner: any;
  latestMetric: ApproxProgressPayload | null;
  approxProgressEvents: QuerySessionEvent<"approx_progress">[];
}) {
  return (
    <div className="bubble-result-panel">
      {sqlEvent && (
        <section className="bubble-result-section">
          <h3 className="bubble-result-heading">Generated SQL Query</h3>
          <pre className="bubble-sql">{sqlEvent.payload.sql}</pre>
        </section>
      )}

      {planner && (
        <section className="bubble-result-section">
          <h3 className="bubble-result-heading">Planner Rationale</h3>
          <div className="bubble-planner">
            <p>Strategy: {planner.strategy}</p>
            <p>Reason: {planner.rationale}</p>
            <p>Target: {planner.target_summary}</p>
          </div>
        </section>
      )}

      {/* Convergence Graph */}
      <section className="bubble-result-section bubble-graph-section">
        <div className="bubble-graph-area">
          <span className="bubble-graph-y-label">Error Percentage</span>
          <ConvergenceGraph mode={mode} points={approxProgressEvents} />
          <span className="bubble-graph-x-label">Data Scanned Percentage</span>
        </div>
      </section>
    </div>
  );
}

// ── Convergence Graph ─────────────────────────────────────────────────────────

function ConvergenceGraph({
  mode,
  points,
}: {
  mode: "live" | "regular";
  points: QuerySessionEvent<"approx_progress">[];
}) {
  const W = 600;
  const H = 380;
  const PAD_LEFT = 10;
  const PAD_RIGHT = 10;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 10;
  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - PAD_TOP - PAD_BOTTOM;

  if (points.length === 0) {
    return (
      <div className="bubble-graph-canvas">
        <p className="bubble-graph-empty">Graph will render as data streams in…</p>
      </div>
    );
  }

  const computeXY = (p: QuerySessionEvent<"approx_progress">, i: number) => {
    const x = PAD_LEFT + (i / Math.max(points.length - 1, 1)) * plotW;
    const y = PAD_TOP + plotH - Math.min(p.payload.relative_error * 1800, plotH - PAD_TOP);
    return { x, y };
  };

  const coords = points.map(computeXY);
  const last = coords[coords.length - 1];
  const lastPt = points[points.length - 1];
  const tooltipLabel = `${Math.round(lastPt.payload.data_scanned_pct * 100)}, ${Math.round(lastPt.payload.relative_error * 1000) / 10}`;

  if (mode === "regular") {
    // Regular mode: just a single dot, no line
    return (
      <div className="bubble-graph-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%" }}>
          {/* Axes */}
          <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + plotH} stroke="#444" strokeWidth="1" />
          <line x1={PAD_LEFT} y1={PAD_TOP + plotH} x2={PAD_LEFT + plotW} y2={PAD_TOP + plotH} stroke="#444" strokeWidth="1" />

          {/* Moving dot */}
          <circle cx={last.x} cy={last.y} r="6" fill="#7dd3fc" />

          {/* Tooltip */}
          <g>
            <rect
              x={last.x - 30}
              y={last.y - 30}
              width={70}
              height={22}
              rx={4}
              fill="#1e1e1e"
              stroke="#555"
              strokeWidth="0.5"
            />
            <text
              x={last.x + 5}
              y={last.y - 15}
              fill="white"
              fontSize="11"
              textAnchor="middle"
            >
              {tooltipLabel}
            </text>
          </g>
        </svg>
      </div>
    );
  }

  // Live mode: glowing wavy line + moving dot
  const polylinePoints = coords.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <div className="bubble-graph-canvas">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%" }}>
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Axes */}
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + plotH} stroke="#444" strokeWidth="1" />
        <line x1={PAD_LEFT} y1={PAD_TOP + plotH} x2={PAD_LEFT + plotW} y2={PAD_TOP + plotH} stroke="#444" strokeWidth="1" />

        {/* Glow line (thicker, more blur) */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="8"
          filter="url(#glow)"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Main line */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Moving dot */}
        <circle cx={last.x} cy={last.y} r="6" fill="#7dd3fc" />

        {/* Tooltip */}
        <g>
          <rect
            x={last.x - 30}
            y={last.y - 30}
            width={70}
            height={22}
            rx={4}
            fill="#1e1e1e"
            stroke="#555"
            strokeWidth="0.5"
          />
          <text
            x={last.x + 5}
            y={last.y - 15}
            fill="white"
            fontSize="11"
            textAnchor="middle"
          >
            {tooltipLabel}
          </text>
        </g>
      </svg>
    </div>
  );
}

// ── Metric helpers ────────────────────────────────────────────────────────────

function MetricSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bubble-metric-section">
      <p className="bubble-metric-title">{title}</p>
      {children}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="bubble-metric-row">
      {label}: <span>{value}</span>
    </p>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function BubbleIcon({ type }: { type: "chat" | "search" | "history" }) {
  if (type === "chat") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    );
  }
  if (type === "search") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLastEventByType<Type extends QuerySessionEventType>(
  events: AnyQuerySessionEvent[],
  type: Type
): QuerySessionEvent<Type> | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === type) return events[i] as QuerySessionEvent<Type>;
  }
  return undefined;
}

function getEventsByType<Type extends QuerySessionEventType>(
  events: AnyQuerySessionEvent[],
  type: Type
): QuerySessionEvent<Type>[] {
  return events.filter((e) => e.type === type) as QuerySessionEvent<Type>[];
}

function lastItem<T>(items: T[]): T | undefined {
  return items.length === 0 ? undefined : items[items.length - 1];
}