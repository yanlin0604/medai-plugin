/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ASR_WS_URL: string;
  readonly VITE_FIELD_EXTRACTION_WS_URL: string;
  readonly VITE_ROUND_MOCK_ASR: string;
  readonly VITE_APP_TITLE: string;
  readonly VITE_PLUGIN_API_KEY: string;
  readonly VITE_AUTH_LOGIN_PATH: string;
  readonly VITE_AUTH_MOCK: string;
  readonly VITE_AUTH_PASSWORD_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __TAURI_INTERNALS__?: unknown;
}
