/// <reference types="vite/client" />

// Tauri global type declaration
declare global {
  interface Window {
    __TAURI__?: Record<string, unknown>;
  }
}

export {};
