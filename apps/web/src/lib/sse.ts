import type { AnyQuerySessionEvent, QuerySessionEventType } from "../types/query";

const STREAMED_EVENT_TYPES: QuerySessionEventType[] = [
  "sql_generated",
  "plan_ready",
  "approx_progress",
  "approx_final",
  "exact_result",
  "error",
];

export interface QuerySessionEventStream {
  close: () => void;
  done: Promise<void>;
}

interface ConnectStreamOptions {
  url: string;
  onEvent: (event: AnyQuerySessionEvent) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export function connectQuerySessionEventStream(
  options: ConnectStreamOptions,
): QuerySessionEventStream {
  const eventSource = new EventSource(options.url);

  let settled = false;
  let resolveDone!: () => void;
  let rejectDone!: (error: Error) => void;

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  function closeSilently() {
    if (settled) {
      return;
    }

    settled = true;
    eventSource.close();
    resolveDone();
  }

  function fail(error: Error) {
    if (settled) {
      return;
    }

    settled = true;
    eventSource.close();
    options.onError?.(error);
    rejectDone(error);
  }

  function complete() {
    if (settled) {
      return;
    }

    settled = true;
    eventSource.close();
    options.onComplete?.();
    resolveDone();
  }

  function handleMessage(message: MessageEvent<string>) {
    try {
      const event = JSON.parse(message.data) as AnyQuerySessionEvent;
      options.onEvent(event);

      if (event.type === "exact_result") {
        complete();
        return;
      }

      if (event.type === "error") {
        fail(new Error(event.payload.message));
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error("Invalid SSE payload."));
    }
  }

  for (const eventType of STREAMED_EVENT_TYPES) {
    eventSource.addEventListener(eventType, handleMessage as EventListener);
  }

  eventSource.onerror = () => {
    fail(new Error("Event stream connection failed."));
  };

  return {
    close: closeSilently,
    done,
  };
}
