# Features

Business logic organized by domain (`rooms`, `auth`, `meetings`, etc.), per [DEV_STANDARDS.md §3.1](../../../../DEV_STANDARDS.md).

Each feature folder owns its own `components/`, `hooks/`, and `api.ts`. Features must never import from `../app/*` — ESLint (`eslint-plugin-boundaries`) enforces this: routing (`app/`) depends on features, never the other way around.
