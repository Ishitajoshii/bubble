import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import "./App.css";
import ConvergenceGraph from "./features/convergence-graph";
import { createQuerySessionClient, type QuerySessionRun } from "./lib/api";
import { formatDuration, formatInteger, formatPercent } from "./lib/format";
import type {
  AnyQuerySessionEvent,
  ApproxFinalPayload,
  ApproxProgressPayload,
  DatasetSummary,
  ExactResultPayload,
  PlanReadyPayload,
  QueryHistoryItem,
  QueryStrategy,
  SqlGeneratedPayload,
} from "./types/query";

const QUERY_CLIENT = createQuerySessionClient();
const DEFAULT_CONFIDENCE_LEVEL = 0.95;

type Mode = "Live" | "Regular";
type AppView = "landing" | "bubble";

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
  elapsed: string;
  dataScanned: string;
  computeSaved: string;
  sampleRows: string;
  exactValue: string;
  delta: string;
  deltaPct: number;
  speedup: string;
  convergencePoints: Array<{
    iteration: number;
    data_scanned_pct: number;
    relative_error: number;
    elapsed_ms: number;
  }>;
}

const INITIAL_STEPS: PipelineStep[] = [
  { id: "sql", label: "SQL", status: "idle" },
  { id: "plan", label: "Plan", status: "idle" },
  { id: "approx", label: "Approx", status: "idle" },
  { id: "exact", label: "Exact", status: "idle" },
];

const STRATEGY_LABELS: Record<QueryStrategy, string> = {
  adaptive_sampling: "Adaptive Sampling",
  stratified_sampling: "Stratified Sampling",
  hyperloglog: "HyperLogLog",
  reservoir_sampling: "Reservoir Sampling",
  exact_fallback: "Exact Fallback",
};

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

const NewChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const HistoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-4.95" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

function buildResult(args: {
  sqlPayload: SqlGeneratedPayload | null;
  planPayload: PlanReadyPayload | null;
  approxPayload: ApproxProgressPayload | ApproxFinalPayload | null;
  exactPayload: ExactResultPayload | null;
  convergencePoints: QueryResult["convergencePoints"];
  fallbackErrorTolerance: number;
}): QueryResult | null {
  const { sqlPayload, planPayload, approxPayload, exactPayload, convergencePoints, fallbackErrorTolerance } = args;
  if (!sqlPayload && !planPayload && !approxPayload && !exactPayload) {
    return null;
  }

  const targetError = planPayload?.planner.target_error_pct ?? fallbackErrorTolerance * 100;
  const confidence = (planPayload?.planner.confidence_level ?? DEFAULT_CONFIDENCE_LEVEL) * 100;
  const targetSummary =
    planPayload?.planner.target_summary ??
    `Within ${targetError.toFixed(0)}% at ${confidence.toFixed(0)}% confidence`;

  const scalarExact = exactPayload?.result_scope === "scalar" ? exactPayload : null;
  const groupedExact = exactPayload?.result_scope === "grouped" ? exactPayload : null;

  return {
    sql: sqlPayload?.sql ?? "Generating...",
    strategy: planPayload ? STRATEGY_LABELS[planPayload.planner.strategy] : "Pending",
    strategyReason: planPayload?.planner.rationale ?? "Waiting for planner rationale",
    target: targetSummary,
    targetMet: approxPayload?.target_met ?? false,
    targetError,
    confidence,
    estimate:
      approxPayload?.result_scope === "scalar"
        ? approxPayload.display_value
        : approxPayload
          ? "Grouped result"
          : "Pending",
    relativeError: (approxPayload?.relative_error ?? groupedExact?.max_delta_pct ?? 0) * 100,
    elapsed: formatDuration(
      scalarExact?.approx_latency_ms ??
        groupedExact?.approx_latency_ms ??
        approxPayload?.elapsed_ms ??
        0,
    ),
    dataScanned: formatPercent(approxPayload?.data_scanned_pct ?? 0, 1),
    computeSaved: formatPercent(approxPayload?.compute_saved_pct ?? 0, 1),
    sampleRows: formatInteger(approxPayload?.sample_rows ?? 0),
    exactValue:
      scalarExact?.display_value ??
      (groupedExact ? `${groupedExact.group_count} groups` : "Pending"),
    delta: formatInteger(
      Math.abs(
        scalarExact?.delta ??
          groupedExact?.mean_delta_pct ??
          0,
      ),
    ),
    deltaPct: (scalarExact?.delta_pct ?? groupedExact?.mean_delta_pct ?? 0) * 100,
    speedup:
      scalarExact?.speedup || groupedExact?.speedup
        ? `${(scalarExact?.speedup ?? groupedExact?.speedup ?? 0).toFixed(2)}x`
        : "Pending",
    convergencePoints,
  };
}

function InputBar({
  value,
  onChange,
  onSubmit,
  onUploadDataset,
  uploadInProgress = false,
  placeholder = "Ask anything",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUploadDataset: (file: File) => Promise<void>;
  uploadInProgress?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    await onUploadDataset(file);
  };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 740 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.json,.xml,.sqlite,.sqlite3,.db"
        onChange={(event) => {
          void handleFileChange(event);
        }}
        style={{ display: "none" }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "rgba(255,255,255,0.04)",
          border: "1.5px solid #FB90B0",
          borderRadius: 999,
          padding: 5,
          boxShadow: "0 0 20px rgba(251,144,176,0.15)",
          gap: 7,
        }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          type="button"
          disabled={disabled || uploadInProgress}
          title="Upload dataset"
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: uploadInProgress ? "rgba(251,144,176,0.2)" : "transparent",
            border: "1.5px solid #FB90B0",
            color: "#FB90B0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: disabled || uploadInProgress ? "not-allowed" : "pointer",
            flexShrink: 0,
            opacity: disabled || uploadInProgress ? 0.55 : 1,
          }}
        >
          <PlusIcon />
        </button>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#ffffff",
            fontSize: 14,
            fontFamily: "'Aldrich'",
            caretColor: "#FB90B0",
            opacity: disabled ? 0.5 : 1,
          }}
        />
        {value.trim() && !disabled && (
          <button
            onClick={onSubmit}
            type="button"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "#FB90B0",
              border: "none",
              color: "#1a1320",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function Sidebar({
  onNew,
  onHistory,
  onShowHistory,
  history,
  datasetLabel,
}: {
  onNew: () => void;
  onHistory: (item: QueryHistoryItem) => void;
  onShowHistory: () => void;
  history: QueryHistoryItem[];
  datasetLabel: string;
}) {
  const historySectionRef = useRef<HTMLDivElement | null>(null);

  const formatHistoryMeta = (item: QueryHistoryItem): string => {
    const modeLabel = item.live_mode ? "Live" : "Regular";
    const errorLabel = `${Math.round(item.error_tolerance * 100)}%`;
    const timestamp = new Date(item.created_at).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `${item.dataset_label} | ${modeLabel} | +/-${errorLabel} | ${timestamp}`;
  };

  return (
    <aside
      style={{
        width: 238,
        minWidth: 238,
        background: "#222222",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        padding: "30px 0 0",
        zIndex: 10,
        overflowY: "auto",
      }}
    >
      <div style={{ padding: "0 20px 12px" }}>
        <span
          style={{
            fontSize: 26,
            color: "#FB90B0",
            letterSpacing: 1,
            fontWeight: 200,
            fontFamily: "'BD_Caramel'",
          }}
        >
          Bubble
        </span>
      </div>

      <div
        style={{
          margin: "0 20px 18px",
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(251,144,176,0.12)",
          fontFamily: "'Aldrich'",
        }}
      >
        <div style={{ fontSize: 10, color: "#7a6a85", marginBottom: 4 }}>Dataset</div>
        <div style={{ fontSize: 12, color: "#ffffff", lineHeight: 1.4 }}>{datasetLabel}</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0 10px" }}>
        {[
          { icon: <NewChatIcon />, label: "New Chat", action: onNew },
          { icon: <SearchIcon />, label: "Query Source", action: () => undefined },
          {
            icon: <HistoryIcon />,
            label: "History",
            action: () => {
              onShowHistory();
              historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
        ].map(({ icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              background: "rgba(255,255,255,0.04)",
              border: "none",
              borderRadius: 9,
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'Aldrich'",
              textAlign: "left",
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <div ref={historySectionRef} style={{ padding: "18px 10px 0", flex: 1 }}>
        <div style={{ padding: "0 12px 8px", color: "#FB90B0", fontSize: 11, fontFamily: "'Aldrich'" }}>
          Recent Queries
        </div>
        {history.length === 0 ? (
          <div style={{ padding: "0 12px", color: "#7a6a85", fontSize: 11, lineHeight: 1.5, fontFamily: "'Aldrich'" }}>
            No history yet.
          </div>
        ) : (
          history.map((item) => (
            <button
              key={item.session_id}
              onClick={() => onHistory(item)}
              type="button"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#7a6a85",
                fontSize: 12,
                lineHeight: 1.45,
                fontFamily: "'Aldrich'",
                marginBottom: 4,
                borderRadius: 10,
              }}
            >
              <div style={{ color: "#ffffff", marginBottom: 4 }}>{item.prompt}</div>
              <div style={{ color: "#7a6a85", fontSize: 10 }}>{formatHistoryMeta(item)}</div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function StatusPanel({
  steps,
  result,
  streaming,
  errorMessage,
}: {
  steps: PipelineStep[];
  result: QueryResult | null;
  streaming: boolean;
  errorMessage: string | null;
}) {
  const statusLabel = errorMessage
    ? "Query Failed"
    : streaming
      ? "Streaming Result"
      : result
        ? "Result Ready"
        : "Waiting for Prompt";

  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
        background: "#222222",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 16px",
        overflowY: "auto",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#FB90B0",
            marginBottom: 16,
            textDecoration: "underline",
            fontFamily: "'Aldrich'",
          }}
        >
          Status
        </h3>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ animation: "floatBubble 5s ease-in-out infinite" }}>
            <BubbleSmall size={72} />
          </div>
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 13,
            fontWeight: 600,
            color: errorMessage ? "#ffb4c9" : "#FB90B0",
            marginBottom: 14,
            fontFamily: "'Aldrich'",
          }}
        >
          {statusLabel}
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 20 }}>
          {steps.map((step, index) => (
            <div key={step.id} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: `2px solid ${step.status === "idle" ? "rgba(162,227,246,0.4)" : "#A2E3F6"}`,
                  background:
                    step.status === "done"
                      ? "#A2E3F6"
                      : step.status === "active"
                        ? "rgba(162,227,246,0.5)"
                        : "transparent",
                  boxShadow: step.status !== "idle" ? "0 0 6px rgba(162,227,246,0.5)" : "none",
                }}
              />
              {index < steps.length - 1 && (
                <div
                  style={{
                    width: 28,
                    height: 1.5,
                    background: step.status === "done" ? "#A2E3F6" : "rgba(162,227,246,0.2)",
                    borderTop: `1.5px dashed ${step.status === "done" ? "rgba(162,227,246,0.7)" : "rgba(162,227,246,0.25)"}`,
                    margin: "0 1px",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {errorMessage && (
          <div
            style={{
              width: "100%",
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(251,144,176,0.08)",
              border: "1px solid rgba(251,144,176,0.2)",
              color: "#ffd5e1",
              fontSize: 11,
              lineHeight: 1.5,
              fontFamily: "'Aldrich'",
            }}
          >
            {errorMessage}
          </div>
        )}

        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
            <ResultBlock title="Targets">
              <MetricRow label="Target Error" value={formatPercent(result.targetError, 1)} />
              <MetricRow label="Confidence" value={formatPercent(result.confidence, 0)} />
              <MetricRow label="Status" value={result.targetMet ? "Achieved" : "In Progress"} highlight={result.targetMet} />
            </ResultBlock>

            <ResultBlock title="Approximate">
              <MetricRow label="Estimate" value={result.estimate} />
              <MetricRow label="Relative Error" value={formatPercent(result.relativeError, 1)} />
              <MetricRow label="Elapsed" value={result.elapsed} />
            </ResultBlock>

            <ResultBlock title="Scanned">
              <MetricRow label="Data Scanned" value={result.dataScanned} />
              <MetricRow label="Compute Saved" value={result.computeSaved} />
              <MetricRow label="Sample Rows" value={result.sampleRows} />
            </ResultBlock>

            <ResultBlock title="Exact">
              <MetricRow label="Exact Value" value={result.exactValue} />
              <MetricRow label="Delta" value={`${result.delta} | ${formatPercent(result.deltaPct, 1)}`} />
              <MetricRow label="Speedup" value={result.speedup} />
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
      <p style={{ fontSize: 12, fontWeight: 700, color: "#ffffff", marginBottom: 6, fontFamily: "'Aldrich'" }}>{title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{children}</div>
    </div>
  );
}

function MetricRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 11, color: "#7a6a85", fontFamily: "'Aldrich'" }}>{label}:</span>
      <span
        style={{
          fontSize: 11,
          color: highlight ? "#A2E3F6" : "#ffffff",
          fontWeight: 500,
          fontFamily: "'Aldrich'",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ErrorSlider({
  value,
  onChange,
  onClose,
}: {
  value: number;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        bottom: "calc(100% + 12px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(28,20,33,0.97)",
        border: "1px solid rgba(251,144,176,0.25)",
        borderRadius: 14,
        padding: "16px 20px",
        minWidth: 260,
        boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
        zIndex: 200,
        animation: "menuIn 0.18s cubic-bezier(.22,1,.36,1)",
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", textAlign: "center", marginBottom: 8, fontFamily: "'Aldrich'" }}>
        Choose Error Percentage
      </p>
      <p style={{ fontSize: 18, fontWeight: 700, color: "#FB90B0", textAlign: "center", marginBottom: 10, fontFamily: "'Aldrich'" }}>
        {Math.round(value * 100)}%
      </p>
      <input
        type="range"
        min="0.01"
        max="0.20"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: "100%", accentColor: "#FB90B0" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "#7a6a85" }}>Low</span>
        <span style={{ fontSize: 10, color: "#7a6a85" }}>High</span>
      </div>
    </div>
  );
}

function LandingView({
  onSubmit,
  onUploadDataset,
  uploadInProgress,
  mode,
  errorTolerance,
  onErrorToleranceChange,
  datasetLabel,
  datasetDescription,
  backendStatus,
  examplePrompts,
}: {
  onSubmit: (prompt: string) => void;
  onUploadDataset: (file: File) => Promise<void>;
  uploadInProgress: boolean;
  mode: Mode;
  errorTolerance: number;
  onErrorToleranceChange: (value: number) => void;
  datasetLabel: string;
  datasetDescription: string;
  backendStatus: string;
  examplePrompts: string[];
}) {
  const [input, setInput] = useState("");
  const [showSlider, setShowSlider] = useState(false);

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
      setInput("");
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(162,227,246,0.1) 0%, transparent 70%)",
          pointerEvents: "none",
          animation: "glowPulse 4s ease-in-out infinite",
        }}
      />

      <div
        style={{
          animation: "floatBubble 5s ease-in-out infinite",
          marginBottom: 24,
          zIndex: 1,
          filter: "drop-shadow(0 10px 28px rgba(162,227,246,0.32))",
        }}
      >
        <BubbleSmile size={120} />
      </div>

      <p
        style={{
          color: "#ffffff",
          fontSize: 16,
          fontWeight: 500,
          marginBottom: 10,
          textAlign: "center",
          zIndex: 1,
          fontFamily: "'Aldrich'",
        }}
      >
        Ask a question against your backend dataset.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          marginBottom: 28,
          zIndex: 1,
          maxWidth: 620,
        }}
      >
        <p style={{ color: "#FB90B0", fontSize: 12, fontFamily: "'Aldrich'" }}>{datasetLabel}</p>
        <p style={{ color: "#8f8098", fontSize: 11, fontFamily: "'Aldrich'", textAlign: "center", lineHeight: 1.5 }}>
          {datasetDescription}
        </p>
        <p style={{ color: "#7a6a85", fontSize: 10, fontFamily: "'Aldrich'" }}>{backendStatus}</p>
      </div>

      {examplePrompts.length > 0 && (
        <div
          style={{
            width: "100%",
            maxWidth: 760,
            marginBottom: 26,
            zIndex: 1,
          }}
        >
          <div
            style={{
              border: "1px solid rgba(251,144,176,0.16)",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 18,
              padding: "16px 18px",
            }}
          >
            <p style={{ color: "#ffffff", fontSize: 12, fontFamily: "'Aldrich'", marginBottom: 10 }}>
              Example Queries
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {examplePrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSubmit(prompt)}
                  style={{
                    border: "1px solid rgba(162,227,246,0.24)",
                    background: "rgba(162,227,246,0.06)",
                    color: "#d9f4fb",
                    borderRadius: 999,
                    padding: "7px 12px",
                    fontSize: 11,
                    lineHeight: 1.4,
                    cursor: "pointer",
                    fontFamily: "'Aldrich'",
                    textAlign: "left",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "relative", width: "100%", maxWidth: 680, zIndex: 10 }}>
        {mode === "Regular" && showSlider && (
          <ErrorSlider value={errorTolerance} onChange={onErrorToleranceChange} onClose={() => setShowSlider(false)} />
        )}
        {mode === "Regular" && (
          <button
            onClick={() => setShowSlider((prev) => !prev)}
            type="button"
            style={{
              position: "absolute",
              top: -34,
              right: 0,
              background: "transparent",
              border: "1px solid rgba(251,144,176,0.35)",
              borderRadius: 8,
              padding: "4px 12px",
              color: "#FB90B0",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "'Aldrich'",
              fontWeight: 500,
            }}
          >
            Error +/-{Math.round(errorTolerance * 100)}%
          </button>
        )}
        <InputBar
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onUploadDataset={onUploadDataset}
          uploadInProgress={uploadInProgress}
        />
      </div>
    </div>
  );
}

function ResultView({
  result,
  streaming,
  onSubmit,
  onUploadDataset,
  uploadInProgress,
  errorMessage,
  datasetLabel,
  mode,
}: {
  result: QueryResult | null;
  streaming: boolean;
  onSubmit: (prompt: string) => void;
  onUploadDataset: (file: File) => Promise<void>;
  uploadInProgress: boolean;
  errorMessage: string | null;
  datasetLabel: string;
  mode: Mode;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
      setInput("");
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "80px 32px 8px" }}>
        <div
          style={{
            border: "1.5px solid rgba(251,144,176,0.4)",
            borderRadius: 16,
            padding: "20px 22px",
            background: "rgba(255,255,255,0.025)",
            animation: "fadeUp 0.3s ease",
          }}
        >
          <div style={{ marginBottom: 12, color: "#7a6a85", fontSize: 11, fontFamily: "'Aldrich'" }}>
            Dataset: <span style={{ color: "#FB90B0" }}>{datasetLabel}</span>
          </div>

          {(result || streaming) && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", marginBottom: 8, fontFamily: "'Aldrich'" }}>
                Generated SQL Query
              </p>
              <div
                style={{
                  background: "rgba(0,0,0,0.35)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontFamily: "Aldrich",
                  fontSize: 12,
                  color: "#A2E3F6",
                  lineHeight: 1.6,
                }}
              >
                {result?.sql ?? <span style={{ color: "#5a4f65" }}>Generating...</span>}
              </div>
            </div>
          )}

          {result && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", marginBottom: 8, fontFamily: "'Aldrich'" }}>
                Planner Rationale
              </p>
              <div
                style={{
                  background: "rgba(0,0,0,0.25)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {[
                  ["Strategy", result.strategy],
                  ["Reason", result.strategyReason],
                  ["Target", result.target],
                ].map(([label, value]) => (
                  <p key={label} style={{ fontSize: 12, color: "#ffffff", fontFamily: "'Aldrich'", margin: 0 }}>
                    <span style={{ fontWeight: 600 }}>{label}:</span> {value}
                  </p>
                ))}
              </div>
            </div>
          )}

          {(result?.convergencePoints.length || streaming) ? (
            <div style={{ width: "100%" }}>
              <ConvergenceGraph
                points={result?.convergencePoints ?? []}
                targetError={result?.targetError ?? 5}
                targetErrors={mode === "Live" ? [1, 5, 10] : undefined}
                running={streaming}
              />
            </div>
          ) : null}

          {streaming && !result?.convergencePoints.length && (
            <div
              style={{
                height: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                marginTop: 8,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#FB90B0",
                      display: "inline-block",
                      animation: `dotBounce 1.2s ease-in-out ${index * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {errorMessage && (
            <div
              style={{
                marginTop: 18,
                padding: "12px 14px",
                borderRadius: 10,
                background: "rgba(251,144,176,0.08)",
                border: "1px solid rgba(251,144,176,0.18)",
                color: "#ffd9e3",
                fontSize: 12,
                fontFamily: "'Aldrich'",
                lineHeight: 1.5,
              }}
            >
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "12px 32px 24px", display: "flex", justifyContent: "center" }}>
        <InputBar
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onUploadDataset={onUploadDataset}
          uploadInProgress={uploadInProgress}
          placeholder="Ask a follow-up..."
          disabled={streaming}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("Live");
  const [view, setView] = useState<AppView>("landing");
  const [errorTolerance, setErrorTolerance] = useState(0.05);
  const [streaming, setStreaming] = useState(false);
  const [uploadingDataset, setUploadingDataset] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sqlPayload, setSqlPayload] = useState<SqlGeneratedPayload | null>(null);
  const [planPayload, setPlanPayload] = useState<PlanReadyPayload | null>(null);
  const [approxPayload, setApproxPayload] = useState<ApproxProgressPayload | ApproxFinalPayload | null>(null);
  const [exactPayload, setExactPayload] = useState<ExactResultPayload | null>(null);
  const [convergencePoints, setConvergencePoints] = useState<QueryResult["convergencePoints"]>([]);
  const runRef = useRef<QuerySessionRun | null>(null);

  const selectedDataset = useMemo(() => {
    if (datasets.length === 0) {
      return null;
    }

    return datasets.find((dataset) => dataset.dataset_id === selectedDatasetId) ?? datasets[0];
  }, [datasets, selectedDatasetId]);
  const datasetLabel = selectedDataset?.label ?? "Loading dataset";
  const datasetDescription = selectedDataset?.description ?? "The app is loading the backend dataset catalog.";
  const examplePrompts = selectedDataset?.example_prompts ?? [];

  useEffect(() => {
    let active = true;

    void QUERY_CLIENT.listDatasets()
      .then((items) => {
        if (!active) {
          return;
        }
        setDatasets(items);
        setSelectedDatasetId((current) => current ?? items[0]?.dataset_id ?? null);
        setDatasetError(items.length ? null : "No datasets were returned by the backend.");
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setDatasetError(error instanceof Error ? error.message : "Failed to load datasets.");
      });

    void QUERY_CLIENT.listHistory()
      .then((items) => {
        if (!active) {
          return;
        }
        setHistory(items);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setHistory([]);
      });

    return () => {
      active = false;
      runRef.current?.stop();
    };
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const items = await QUERY_CLIENT.listHistory();
      setHistory(items);
    } catch {
      setHistory([]);
    }
  }, []);

  const updateStep = useCallback((id: PipelineStep["id"], status: PipelineStep["status"]) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === id) {
          return { ...step, status };
        }

        const stepIndex = prev.findIndex((value) => value.id === step.id);
        const targetIndex = prev.findIndex((value) => value.id === id);
        if (status === "active" && stepIndex < targetIndex && step.status !== "done") {
          return { ...step, status: "done" };
        }

        return step;
      }),
    );
  }, []);

  const resetSessionState = useCallback(() => {
    setSqlPayload(null);
    setPlanPayload(null);
    setApproxPayload(null);
    setExactPayload(null);
    setConvergencePoints([]);
    setErrorMessage(null);
    setSteps(INITIAL_STEPS);
  }, []);

  const handleEvent = useCallback(
    (event: AnyQuerySessionEvent) => {
      switch (event.type) {
        case "sql_generated":
          setSqlPayload(event.payload);
          updateStep("sql", "active");
          break;
        case "plan_ready":
          setPlanPayload(event.payload);
          updateStep("plan", "active");
          break;
        case "approx_progress":
          setApproxPayload(event.payload);
          updateStep("approx", "active");
          setConvergencePoints((prev) => {
            const nextPoint = event.payload.convergence_point;
            const normalizedPoint = {
              ...nextPoint,
              relative_error: nextPoint.relative_error * 100,
            };
            if (prev.some((point) => point.iteration === nextPoint.iteration)) {
              return prev;
            }
            return [...prev, normalizedPoint];
          });
          break;
        case "approx_final":
          setApproxPayload(event.payload);
          updateStep("approx", "done");
          setConvergencePoints((prev) => {
            const nextPoint = event.payload.convergence_point;
            const normalizedPoint = {
              ...nextPoint,
              relative_error: nextPoint.relative_error * 100,
            };
            if (prev.some((point) => point.iteration === nextPoint.iteration)) {
              return prev;
            }
            return [...prev, normalizedPoint];
          });
          break;
        case "exact_result":
          setExactPayload(event.payload);
          setSteps((prev) => prev.map((step) => ({ ...step, status: "done" })));
          break;
        case "error":
          setErrorMessage(event.payload.message);
          setStreaming(false);
          break;
      }
    },
    [updateStep],
  );

  const result = useMemo(
    () =>
      buildResult({
        sqlPayload,
        planPayload,
        approxPayload,
        exactPayload,
        convergencePoints,
        fallbackErrorTolerance: errorTolerance,
      }),
    [sqlPayload, planPayload, approxPayload, exactPayload, convergencePoints, errorTolerance],
  );

  const handleUploadDataset = useCallback(async (file: File) => {
    setUploadingDataset(true);
    setDatasetError(null);
    setErrorMessage(null);

    try {
      const uploadedDatasets = await QUERY_CLIENT.uploadDataset(file);
      if (uploadedDatasets.length === 0) {
        setDatasetError("The upload completed but no datasets were imported.");
        return;
      }

      const uploadedIds = new Set(uploadedDatasets.map((dataset) => dataset.dataset_id));
      setDatasets((current) => [
        ...uploadedDatasets,
        ...current.filter((dataset) => !uploadedIds.has(dataset.dataset_id)),
      ]);
      setSelectedDatasetId(uploadedDatasets[0].dataset_id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to upload dataset.";
      setDatasetError(message);
      setErrorMessage(message);
    } finally {
      setUploadingDataset(false);
    }
  }, []);

  const runQuery = useCallback(
    async ({
      prompt,
      datasetId,
      liveMode,
      errorToleranceValue,
      confidenceLevel,
    }: {
      prompt: string;
      datasetId?: string;
      liveMode?: boolean;
      errorToleranceValue?: number;
      confidenceLevel?: number;
    }) => {
      const resolvedDatasetId = datasetId ?? selectedDataset?.dataset_id ?? null;
      const dataset = datasets.find((item) => item.dataset_id === resolvedDatasetId) ?? null;
      if (!dataset) {
        setErrorMessage(datasetError ?? "No dataset is available yet.");
        return;
      }

      const resolvedLiveMode = liveMode ?? (mode === "Live");
      const resolvedErrorTolerance = errorToleranceValue ?? errorTolerance;
      const resolvedConfidenceLevel = confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL;

      runRef.current?.stop();
      resetSessionState();
      setSelectedDatasetId(dataset.dataset_id);
      setView("bubble");
      setStreaming(true);

      try {
        const run = await QUERY_CLIENT.startSession(
          {
            prompt,
            dataset_id: dataset.dataset_id,
            live_mode: resolvedLiveMode,
            error_tolerance: resolvedErrorTolerance,
            confidence_level: resolvedConfidenceLevel,
          },
          {
            onEvent: handleEvent,
            onError: (error) => {
              setErrorMessage(error.message);
              setStreaming(false);
            },
            onComplete: () => {
              setStreaming(false);
            },
          },
        );

        runRef.current = run;
        void refreshHistory();
        void run.done.finally(() => {
          if (runRef.current === run) {
            setStreaming(false);
          }
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to start query session.");
        setStreaming(false);
      }
    },
    [datasetError, datasets, errorTolerance, handleEvent, mode, refreshHistory, resetSessionState, selectedDataset],
  );

  const handleSubmit = useCallback(
    async (prompt: string) => {
      await runQuery({ prompt });
    },
    [runQuery],
  );

  const handleHistorySelect = useCallback(
    async (item: QueryHistoryItem) => {
      setMode(item.live_mode ? "Live" : "Regular");
      setErrorTolerance(item.error_tolerance);
      await runQuery({
        prompt: item.prompt,
        datasetId: item.dataset_id,
        liveMode: item.live_mode,
        errorToleranceValue: item.error_tolerance,
        confidenceLevel: item.confidence_level,
      });
    },
    [runQuery],
  );

  const handleNew = () => {
    runRef.current?.stop();
    setStreaming(false);
    setView("landing");
    resetSessionState();
  };

  const backendStatus = datasetError
    ? `Dataset load failed: ${datasetError}`
    : `Source: ${QUERY_CLIENT.source === "mock" ? "mock session stream" : "live backend stream"}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Aldrich'; background: #222222; color: #ffffff; height: 100vh; overflow: hidden; }
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
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: "#222222", position: "relative" }}>
        <Sidebar
          onNew={handleNew}
          onHistory={handleHistorySelect}
          onShowHistory={() => setView("landing")}
          history={history}
          datasetLabel={datasetLabel}
        />

        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 10, zIndex: 20 }}>
            {(["Live", "Regular"] as Mode[]).map((value) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                type="button"
                style={{
                  padding: "7px 22px",
                  borderRadius: 999,
                  border: "1.5px solid",
                  borderColor: mode === value ? "#FB90B0" : "rgba(255,255,255,0.22)",
                  background: mode === value ? "rgba(251,144,176,0.12)" : "transparent",
                  color: mode === value ? "#FB90B0" : "#9a8aaa",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'Aldrich'",
                }}
              >
                {value}
              </button>
            ))}
          </div>

          {view === "landing" ? (
            <LandingView
              onSubmit={handleSubmit}
              onUploadDataset={handleUploadDataset}
              uploadInProgress={uploadingDataset}
              mode={mode}
              errorTolerance={errorTolerance}
              onErrorToleranceChange={setErrorTolerance}
              datasetLabel={datasetLabel}
              datasetDescription={datasetDescription}
              backendStatus={backendStatus}
              examplePrompts={examplePrompts}
            />
          ) : (
            <ResultView
              result={result}
              streaming={streaming}
              onSubmit={handleSubmit}
              onUploadDataset={handleUploadDataset}
              uploadInProgress={uploadingDataset}
              errorMessage={errorMessage}
              datasetLabel={datasetLabel}
              mode={mode}
            />
          )}
        </main>

        <StatusPanel steps={steps} result={result} streaming={streaming} errorMessage={errorMessage} />
      </div>
    </>
  );
}
