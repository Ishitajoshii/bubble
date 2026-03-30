import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

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
  ExactResultPayload,
  QuerySessionEvent,
  QuerySessionEventType,
} from "./types/query";

const queryClient = createQuerySessionClient();

export default function App() {
  const activeRunRef = useRef<QuerySessionRun | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetId, setDatasetId] = useState(
    mockCreateQuerySessionRequest.dataset_id,
  );
  const [prompt, setPrompt] = useState(mockCreateQuerySessionRequest.prompt);
  const [errorTolerance, setErrorTolerance] = useState(
    mockCreateQuerySessionRequest.error_tolerance,
  );
  const [confidenceLevel, setConfidenceLevel] = useState(
    mockCreateQuerySessionRequest.confidence_level,
  );
  const [events, setEvents] = useState<AnyQuerySessionEvent[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(true);
  const [isUploadingDataset, setIsUploadingDataset] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function loadDatasets() {
      setIsLoadingDatasets(true);

      try {
        const items = await queryClient.listDatasets();
        if (disposed) {
          return;
        }

        setDatasets(items);
        if (items.length > 0 && !items.some((item) => item.dataset_id === datasetId)) {
          setDatasetId(items[0].dataset_id);
        }
      } catch (error) {
        if (!disposed) {
          setUiError(error instanceof Error ? error.message : "Failed to load datasets.");
        }
      } finally {
        if (!disposed) {
          setIsLoadingDatasets(false);
        }
      }
    }

    void loadDatasets();

    return () => {
      disposed = true;
      activeRunRef.current?.stop();
    };
  }, []);

  const selectedDataset =
    datasets.find((item) => item.dataset_id === datasetId) ?? datasets[0] ?? null;
  const sqlEvent = getLastEventByType(events, "sql_generated");
  const planEvent = getLastEventByType(events, "plan_ready");
  const approxProgressEvents = getEventsByType(events, "approx_progress");
  const approxFinalEvent = getLastEventByType(events, "approx_final");
  const convergencePoints = withFinalSnapshot(
    approxProgressEvents.map((event) => event.payload),
    approxFinalEvent?.payload,
  );
  const exactResultEvent = getLastEventByType(events, "exact_result");
  const latestMetric =
    approxFinalEvent?.payload ?? lastItem(approxProgressEvents)?.payload ?? null;
  const planner = planEvent?.payload.planner ?? null;
  const exactResult = exactResultEvent?.payload ?? null;
  const runtimeComparison = exactResult
    ? describeRuntimeComparison(exactResult)
    : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    activeRunRef.current?.stop();
    activeRunRef.current = null;
    setUiError(null);
    setEvents([]);
    setSessionId(null);
    setIsStreaming(true);

    try {
      const run = await queryClient.startSession(
        {
          prompt,
          dataset_id: datasetId,
          live_mode: false,
          error_tolerance: errorTolerance,
          confidence_level: confidenceLevel,
        },
        {
          onEvent(streamEvent) {
            setEvents((current) => [...current, streamEvent]);

            if (streamEvent.type === "error") {
              setUiError(streamEvent.payload.message);
            }
          },
          onError(error) {
            setUiError(error.message);
            setIsStreaming(false);
            activeRunRef.current = null;
          },
          onComplete() {
            setIsStreaming(false);
            activeRunRef.current = null;
          },
        },
      );

      activeRunRef.current = run;
      setSessionId(run.sessionId);
      void run.done.catch(() => undefined);
    } catch (error) {
      setUiError(
        error instanceof Error ? error.message : "Failed to start query session.",
      );
      setIsStreaming(false);
    }
  }

  async function handleDatasetUpload(file: File) {
    setUiError(null);
    setUploadMessage(null);
    setIsUploadingDataset(true);

    try {
      const importedDatasets = await queryClient.uploadDataset(file);
      if (importedDatasets.length === 0) {
        throw new Error("The uploaded file did not produce any queryable datasets.");
      }

      setDatasets((current) => mergeDatasets(current, importedDatasets));
      setDatasetId(importedDatasets[0].dataset_id);
      setUploadMessage(
        importedDatasets.length === 1
          ? `Imported ${file.name}.`
          : `Imported ${importedDatasets.length} tables from ${file.name}.`,
      );
    } catch (error) {
      setUiError(
        error instanceof Error ? error.message : "Failed to upload dataset.",
      );
    } finally {
      setIsUploadingDataset(false);
    }
  }

  function handleUploadButtonClick() {
    if (queryClient.source !== "sse") {
      setUiError(
        "Dataset uploads are disabled in mock mode. Restart the web app with VITE_QUERY_SOURCE=sse.",
      );
      return;
    }

    fileInputRef.current?.click();
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    void handleDatasetUpload(file);
  }

  return (
    <div className="shell">
      <div className="shell__header">
        <div>
          <p className="eyebrow">SwiftQuery</p>
          <h1>End-to-end query-session flow</h1>
          <p className="subtle">
            The UI only reacts to streamed events. The source is currently{" "}
            <span className="badge">{queryClient.source}</span>.
          </p>
        </div>
        <div className="status-block">
          <span className={`status-pill ${isStreaming ? "live" : "idle"}`}>
            {isStreaming ? "Streaming" : "Idle"}
          </span>
          {sessionId ? <span className="subtle">Session {sessionId}</span> : null}
        </div>
      </div>

      <form className="panel form-grid" onSubmit={handleSubmit}>
        <label className="field field--wide">
          <span>Prompt</span>
          <textarea
            value={prompt}
            rows={3}
            onChange={(changeEvent) => setPrompt(changeEvent.target.value)}
          />
        </label>

        <label className="field">
          <span>Dataset</span>
          <div className="dataset-picker">
            <select
              value={datasetId}
              disabled={isLoadingDatasets || isUploadingDataset}
              onChange={(changeEvent) => setDatasetId(changeEvent.target.value)}
            >
              {datasets.map((dataset) => (
                <option key={dataset.dataset_id} value={dataset.dataset_id}>
                  {dataset.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="icon-button"
              aria-label="Upload dataset"
              title="Upload CSV, TSV, JSON, XML, or SQLite"
              disabled={isUploadingDataset}
              onClick={handleUploadButtonClick}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            </button>

            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept=".csv,.tsv,.json,.xml,.sqlite,.sqlite3,.db"
              onChange={handleFileInputChange}
            />
          </div>
          <span className="subtle">
            {isUploadingDataset
              ? "Importing file into the query pipeline..."
              : queryClient.source === "sse"
                ? "Upload .csv, .tsv, .json, .xml, or .sqlite files."
                : "Mock mode is active. Restart with `VITE_QUERY_SOURCE=sse` to enable uploads."}
          </span>
          {uploadMessage ? <span className="subtle">{uploadMessage}</span> : null}
        </label>

        <label className="field">
          <span>Error tolerance</span>
          <input
            type="number"
            min="0.01"
            max="0.5"
            step="0.01"
            value={errorTolerance}
            onChange={(changeEvent) =>
              setErrorTolerance(Number(changeEvent.target.value))
            }
          />
        </label>

        <label className="field">
          <span>Confidence</span>
          <input
            type="number"
            min="0.5"
            max="0.99"
            step="0.01"
            value={confidenceLevel}
            onChange={(changeEvent) =>
              setConfidenceLevel(Number(changeEvent.target.value))
            }
          />
        </label>

        <div className="form-actions">
          <button type="submit" disabled={isStreaming || prompt.trim().length === 0}>
            {isStreaming ? "Streaming..." : "Run query"}
          </button>
          <span className="subtle">
            Live API mode is the default. Set `VITE_QUERY_SOURCE=mock` only if you want the mock UI.
          </span>
        </div>
      </form>

      {selectedDataset ? (
        <section className="panel">
          <div className="panel__header">
            <h2>Example prompts</h2>
            <p className="subtle">{selectedDataset.description}</p>
          </div>
          <div className="example-list">
            {selectedDataset.example_prompts.map((example) => (
              <button
                key={example}
                className="ghost-button"
                type="button"
                onClick={() => setPrompt(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {uiError ? <div className="panel panel--error">{uiError}</div> : null}

      <div className="grid grid--three">
        <section className="panel">
          <div className="panel__header">
            <h2>Generated SQL</h2>
            <p className="subtle">Appears after `sql_generated`.</p>
          </div>
          {sqlEvent ? (
            <>
              <pre className="sql-block">{sqlEvent.payload.sql}</pre>
              <p className="subtle">
                Translator {sqlEvent.payload.translation.translator} · latency{" "}
                {formatDuration(sqlEvent.payload.translation.latency_ms)}
              </p>
            </>
          ) : (
            <EmptyState label="Waiting for the generated SQL event." />
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2>Planner rationale</h2>
            <p className="subtle">Appears after `plan_ready`.</p>
          </div>
          {planner ? (
            <dl className="detail-list">
              <div>
                <dt>Strategy</dt>
                <dd>{planner.strategy}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{planner.rationale}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{planner.target_summary}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState label="Waiting for the planner card." />
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2>Target met</h2>
            <p className="subtle">Derived from streamed progress only.</p>
          </div>
          {latestMetric ? (
            <dl className="detail-list">
              <div>
                <dt>Status</dt>
                <dd>{latestMetric.target_met ? "Achieved" : "In progress"}</dd>
              </div>
              <div>
                <dt>Target error</dt>
                <dd>{formatPercent(latestMetric.target_error_pct)}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{formatFractionAsPercent(latestMetric.confidence_level)}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState label="Waiting for progress updates." />
          )}
        </section>
      </div>

      <div className="grid grid--three">
        <section className="panel">
          <div className="panel__header">
            <h2>Approximate result</h2>
            <p className="subtle">Latest event wins.</p>
          </div>
          {latestMetric ? (
            <dl className="detail-list">
              <div>
                <dt>Estimate</dt>
                <dd>{latestMetric.display_value}</dd>
              </div>
              <div>
                <dt>Relative error</dt>
                <dd>{formatFractionAsPercent(latestMetric.relative_error)}</dd>
              </div>
              <div>
                <dt>Elapsed</dt>
                <dd>{formatDuration(latestMetric.elapsed_ms)}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState label="Waiting for approximation output." />
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2>Scanned vs saved</h2>
            <p className="subtle">Uses the latest streamed metrics only.</p>
          </div>
          {latestMetric ? (
            <dl className="detail-list">
              <div>
                <dt>Data scanned</dt>
                <dd>{formatPercent(latestMetric.data_scanned_pct)}</dd>
              </div>
              <div>
                <dt>Compute saved</dt>
                <dd>{formatPercent(latestMetric.compute_saved_pct)}</dd>
              </div>
              <div>
                <dt>Sample rows</dt>
                <dd>{formatInteger(latestMetric.sample_rows)}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState label="Waiting for scanned/saved metrics." />
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2>Exact result</h2>
            <p className="subtle">Arrives asynchronously after `approx_final`.</p>
          </div>
          {exactResult ? (
            <>
              <dl className="detail-list">
                <div>
                  <dt>Exact value</dt>
                  <dd>{exactResult.display_value}</dd>
                </div>
                <div>
                  <dt>Delta</dt>
                  <dd>
                    {exactResult.delta} · {formatFractionAsPercent(exactResult.delta_pct)}
                  </dd>
                </div>
                <div>
                  <dt>{runtimeComparison?.label ?? "Runtime"}</dt>
                  <dd>{runtimeComparison?.value ?? `${exactResult.speedup.toFixed(2)}x`}</dd>
                </div>
                <div>
                  <dt>Approx vs exact</dt>
                  <dd>
                    {formatDuration(exactResult.approx_latency_ms)} ·{" "}
                    {formatDuration(exactResult.exact_latency_ms)}
                  </dd>
                </div>
              </dl>
              {runtimeComparison?.note ? (
                <p className="subtle panel-note">{runtimeComparison.note}</p>
              ) : null}
            </>
          ) : (
            <EmptyState label="Waiting for the exact result event." />
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel__header">
          <h2>Convergence graph</h2>
          <p className="subtle">
            Plots streamed `approx_progress` points with the target threshold line.
          </p>
        </div>
        <ConvergenceGraph
          progressEvents={convergencePoints}
          targetErrorPct={latestMetric?.target_error_pct ?? null}
        />
      </section>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

function ConvergenceGraph({
  progressEvents,
  targetErrorPct,
}: {
  progressEvents: ApproxProgressPayload[];
  targetErrorPct: number | null;
}) {
  const [maxErrorPct, setMaxErrorPct] = useState(25);

  useEffect(() => {
    if (progressEvents.length === 0) {
      setMaxErrorPct(25);
      return;
    }

    const firstErrorPct = progressEvents[0].relative_error * 100;
    setMaxErrorPct(deriveGraphCeiling(firstErrorPct, targetErrorPct));
  }, [progressEvents.length, progressEvents[0]?.iteration, targetErrorPct]);

  if (progressEvents.length === 0) {
    return <EmptyState label="Waiting for approx_progress events." />;
  }

  const width = 860;
  const height = 260;
  const padding = 28;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const points = progressEvents.map((event) => {
    const x = roundGraphCoordinate(
      padding + (event.data_scanned_pct / 100) * plotWidth,
    );
    const errorPct = event.relative_error * 100;
    const plottedErrorPct = Math.min(errorPct, maxErrorPct);
    const y = roundGraphCoordinate(
      padding + (1 - plottedErrorPct / maxErrorPct) * plotHeight,
    );
    return {
      x,
      y,
      errorPct,
      label: `${formatPercent(event.data_scanned_pct)} scanned · ${formatFractionAsPercent(
        event.relative_error,
      )} error`,
    };
  });

  const linePath = buildGraphPath(points);

  const lastPoint = lastItem(points)!;
  const targetLineY =
    targetErrorPct === null
      ? null
      : roundGraphCoordinate(
          padding + (1 - targetErrorPct / maxErrorPct) * plotHeight,
        );

  return (
    <div className="graph">
      <svg
        className="graph__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Convergence graph"
      >
        <rect
          x={padding}
          y={padding}
          width={plotWidth}
          height={plotHeight}
          rx="18"
          className="graph__frame"
        />

        {targetLineY !== null ? (
          <>
            <line
              x1={padding}
              x2={padding + plotWidth}
              y1={targetLineY}
              y2={targetLineY}
              className="graph__target-line"
            />
            <text x={padding + 12} y={targetLineY - 8} className="graph__label">
              target {targetErrorPct === null ? "" : formatPercent(targetErrorPct)}
            </text>
          </>
        ) : null}

        <path d={linePath} className="graph__path" />

        {points.map((point, index) => (
          <g key={`${point.x}-${point.y}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={index === points.length - 1 ? 8 : 5}
              className={index === points.length - 1 ? "graph__dot graph__dot--live" : "graph__dot"}
            />
            {index === points.length - 1 ? (
              <circle
                cx={point.x}
                cy={point.y}
                r={3.5}
                className="graph__dot-core"
              />
            ) : null}
          </g>
        ))}
      </svg>

      <div className="graph__summary">
        <span>{lastPoint.label}</span>
        <span>
          {progressEvents.length} progress update{progressEvents.length === 1 ? "" : "s"}
        </span>
      </div>
      {progressEvents.length === 1 ? (
        <p className="subtle panel-note">
          This query converged in a single sampling step, so the graph shows an anchored endpoint instead of a longer trajectory.
        </p>
      ) : null}
    </div>
  );
}

function getLastEventByType<Type extends QuerySessionEventType>(
  events: AnyQuerySessionEvent[],
  type: Type,
): QuerySessionEvent<Type> | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === type) {
      return event as QuerySessionEvent<Type>;
    }
  }

  return undefined;
}

function getEventsByType<Type extends QuerySessionEventType>(
  events: AnyQuerySessionEvent[],
  type: Type,
): QuerySessionEvent<Type>[] {
  const matches: QuerySessionEvent<Type>[] = [];

  for (const event of events) {
    if (event.type === type) {
      matches.push(event as QuerySessionEvent<Type>);
    }
  }

  return matches;
}

function lastItem<Type>(items: Type[]): Type | undefined {
  return items.length === 0 ? undefined : items[items.length - 1];
}

function withFinalSnapshot(
  progressEvents: ApproxProgressPayload[],
  finalEvent: ApproxProgressPayload | undefined,
): ApproxProgressPayload[] {
  if (!finalEvent) {
    return progressEvents;
  }

  const lastProgress = lastItem(progressEvents);
  if (
    lastProgress &&
    lastProgress.iteration === finalEvent.iteration &&
    lastProgress.sample_rows === finalEvent.sample_rows
  ) {
    return progressEvents;
  }

  return [...progressEvents, finalEvent];
}

function mergeDatasets(
  current: DatasetSummary[],
  incoming: DatasetSummary[],
): DatasetSummary[] {
  const merged = new Map(current.map((dataset) => [dataset.dataset_id, dataset]));

  for (const dataset of incoming) {
    merged.set(dataset.dataset_id, dataset);
  }

  return [...merged.values()];
}

function describeRuntimeComparison(exactResult: ExactResultPayload): {
  label: string;
  value: string;
  note: string | null;
} {
  const approxLatency = Math.max(exactResult.approx_latency_ms, 1);
  const exactLatency = Math.max(exactResult.exact_latency_ms, 1);

  if (exactLatency >= approxLatency) {
    return {
      label: "Speedup",
      value: `${(exactLatency / approxLatency).toFixed(2)}x faster`,
      note: null,
    };
  }

  return {
    label: "Runtime",
    value: `${(approxLatency / exactLatency).toFixed(2)}x slower than exact`,
    note: "Small or easy datasets can make the exact DuckDB query faster than the current sampler.",
  };
}

function buildGraphPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const point = points[0];
    const stubStartX = roundGraphCoordinate(Math.max(28, point.x - 22));
    return `M ${stubStartX} ${point.y} L ${point.x} ${point.y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const point = points[index];
    const controlX = roundGraphCoordinate((previousPoint.x + point.x) / 2);
    path += ` C ${controlX} ${previousPoint.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }

  return path;
}

function roundGraphCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

function deriveGraphCeiling(
  firstErrorPct: number,
  targetErrorPct: number | null,
): number {
  const baseline = Math.max(
    25,
    firstErrorPct * 2,
    (targetErrorPct ?? 5) * 3,
  );
  return Math.ceil(baseline / 5) * 5;
}
