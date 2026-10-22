/// <reference types="vite/client" />

// The backend's API_KEY from the project's .env, injected by vite.config.ts
// for the dev server only; empty in production builds and tests.
declare const __ENV_API_KEY__: string
