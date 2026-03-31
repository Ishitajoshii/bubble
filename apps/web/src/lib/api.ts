import {
  mockCreateQuerySessionResponse,
  mockQueryDataset,
  streamMockQuerySessionEvents,
} from "../mocks/query-session";
import type {
  AnyQuerySessionEvent,
  CreateQuerySessionRequest,
  CreateQuerySessionResponse,
  DatasetListResponse,
  DatasetSummary,
  QueryHistoryItem,
  QueryHistoryListResponse,
} from "../types/query";
import { connectQuerySessionEventStream } from "./sse";

export type QuerySource = "mock" | "sse";

export interface QuerySessionRun {
  sessionId: string;
  stop: () => void;
  done: Promise<void>;
}

export interface StartSessionOptions {
  onEvent: (event: AnyQuerySessionEvent) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export interface QuerySessionClient {
  source: QuerySource;
  listDatasets: () => Promise<DatasetSummary[]>;
  listHistory: () => Promise<QueryHistoryItem[]>;
  uploadDataset: (file: File) => Promise<DatasetSummary[]>;
  startSession: (
    request: CreateQuerySessionRequest,
    options: StartSessionOptions,
  ) => Promise<QuerySessionRun>;
}

const DEFAULT_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000") as string;
const MOCK_HISTORY_STORAGE_KEY = "bubble-query_history";

export function resolveQuerySource(): QuerySource {
  return import.meta.env.VITE_QUERY_SOURCE === "mock" ? "mock" : "sse";
}

export function createQuerySessionClient(
  source: QuerySource = resolveQuerySource(),
): QuerySessionClient {
  return source === "sse"
    ? createSseQuerySessionClient(DEFAULT_API_BASE_URL)
    : createMockQuerySessionClient();
}

function createMockQuerySessionClient(): QuerySessionClient {
  return {
    source: "mock",
    async listDatasets() {
      return [mockQueryDataset];
    },
    async listHistory() {
      return readMockHistory();
    },
    async uploadDataset() {
      throw new Error("Dataset uploads require the live SSE API source.");
    },
    async startSession(request, options) {
      let stopped = false;
      const sessionId = `${mockCreateQuerySessionResponse.session_id}_${Date.now()}`;
      writeMockHistory([
        {
          session_id: sessionId,
          prompt: request.prompt,
          dataset_id: request.dataset_id,
          dataset_label:
            request.dataset_id === mockQueryDataset.dataset_id
              ? mockQueryDataset.label
              : request.dataset_id,
          live_mode: request.live_mode,
          error_tolerance: request.error_tolerance,
          confidence_level: request.confidence_level,
          created_at: new Date().toISOString(),
        },
        ...readMockHistory().filter((item) => item.session_id !== sessionId),
      ]);

      const done = (async () => {
        try {
          for await (const event of streamMockQuerySessionEvents()) {
            if (stopped) {
              return;
            }

            const normalizedEvent = normalizeMockEvent(event, request, sessionId);
            options.onEvent(normalizedEvent);

            if (normalizedEvent.type === "error") {
              options.onError?.(new Error(normalizedEvent.payload.message));
              return;
            }
          }

          if (!stopped) {
            options.onComplete?.();
          }
        } catch (error) {
          options.onError?.(
            error instanceof Error ? error : new Error("Mock stream failed."),
          );
        }
      })();

      return {
        sessionId,
        stop() {
          stopped = true;
        },
        done,
      };
    },
  };
}

function createSseQuerySessionClient(apiBaseUrl: string): QuerySessionClient {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, "");

  return {
    source: "sse",
    async listDatasets() {
      const response = await fetch(`${normalizedBaseUrl}/api/datasets`);
      if (!response.ok) {
        throw new Error(`Failed to load datasets (${response.status}).`);
      }

      const payload = (await response.json()) as DatasetListResponse;
      return payload.items;
    },
    async listHistory() {
      const response = await fetch(`${normalizedBaseUrl}/api/query-sessions/history`);
      if (!response.ok) {
        throw new Error(`Failed to load history (${response.status}).`);
      }

      const payload = (await response.json()) as QueryHistoryListResponse;
      return payload.items;
    },
    async uploadDataset(file) {
      const response = await fetch(`${normalizedBaseUrl}/api/datasets/upload`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });

      if (!response.ok) {
        let message = `Failed to upload dataset (${response.status}).`;

        try {
          const payload = (await response.json()) as { detail?: string };
          if (payload.detail) {
            message = payload.detail;
          }
        } catch {
          // Ignore non-JSON error bodies and keep the default message.
        }

        throw new Error(message);
      }

      const payload = (await response.json()) as DatasetListResponse;
      return payload.items;
    },
    async startSession(request, options) {
      const response = await fetch(`${normalizedBaseUrl}/api/query-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session (${response.status}).`);
      }

      const payload = (await response.json()) as CreateQuerySessionResponse;
      const stream = connectQuerySessionEventStream({
        url: `${normalizedBaseUrl}/api/query-sessions/${payload.session_id}/events`,
        onEvent: options.onEvent,
        onError: options.onError,
        onComplete: options.onComplete,
      });

      return {
        sessionId: payload.session_id,
        stop: stream.close,
        done: stream.done,
      };
    },
  };
}

function readMockHistory(): QueryHistoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MOCK_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as QueryHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMockHistory(items: QueryHistoryItem[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      MOCK_HISTORY_STORAGE_KEY,
      JSON.stringify(items.slice(0, 20)),
    );
  } catch {
    // Ignore local history persistence failures in mock mode.
  }
}

function normalizeMockEvent(
  event: AnyQuerySessionEvent,
  request: CreateQuerySessionRequest,
  sessionId: string,
): AnyQuerySessionEvent {
  const targetErrorPct = Number((request.error_tolerance * 100).toFixed(1));
  const targetSummary = `Within ${targetErrorPct}% at ${Math.round(
    request.confidence_level * 100,
  )}% confidence`;

  if (event.type === "sql_generated") {
    return {
      ...event,
      session_id: sessionId,
      payload: {
        ...event.payload,
        prompt: request.prompt,
        translation: {
          ...event.payload.translation,
          latency_ms: Math.max(event.payload.translation.latency_ms, 1),
        },
      },
    };
  }

  if (event.type === "plan_ready") {
    return {
      ...event,
      session_id: sessionId,
      payload: {
        planner: {
          ...event.payload.planner,
          confidence_level: request.confidence_level,
          target_error_pct: targetErrorPct,
          target_summary: targetSummary,
        },
      },
    };
  }

  if (event.type === "approx_progress") {
    const targetMet = event.payload.relative_error <= request.error_tolerance;
    const status = targetMet
      ? "target_met"
      : event.payload.status === "target_met"
        ? "converging"
        : event.payload.status;

    return {
      ...event,
      session_id: sessionId,
      payload: {
        ...event.payload,
        confidence_level: request.confidence_level,
        target_error_pct: targetErrorPct,
        target_met: targetMet,
        status,
      },
    };
  }

  if (event.type === "approx_final") {
    const targetMet = event.payload.relative_error <= request.error_tolerance;

    return {
      ...event,
      session_id: sessionId,
      payload: {
        ...event.payload,
        confidence_level: request.confidence_level,
        target_error_pct: targetErrorPct,
        target_met: targetMet,
        status: targetMet ? "target_met" : "converging",
      },
    };
  }

  return {
    ...event,
    session_id: sessionId,
  };
}
