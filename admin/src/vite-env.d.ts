/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_BASE_URL: string;
  readonly VITE_BACKEND_WS_URL:   string;
  readonly VITE_ESP32_WS_URL:     string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
