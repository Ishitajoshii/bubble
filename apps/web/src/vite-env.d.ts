/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_QUERY_SOURCE?: "mock" | "sse";
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
