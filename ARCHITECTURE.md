# Architecture

FretLogic follows an evolving three-layer architecture.

## Domain (`src/domain`)

Pure music and data rules. This layer owns chord recognition, music theory, payload migrations, and persisted-data
sanitization. It never imports Vue, Pinia, DOM APIs, or UI components.

## Data (`src/data`)

External boundaries. Repositories own localStorage access and return validated domain snapshots. Sync providers isolate
remote protocols such as the GitHub Contents API. Transport details and storage quotas are mapped to structured errors
here.

## UI (`src/ui`)

Vue views, components, composables, and stores. Stores orchestrate user intent and derived view state; they do not
implement music theory or persistence rules.

## Data flow

1. Startup repositories read raw storage.
2. Domain validation cleans, migrates, deduplicates, and prunes references.
3. Stores receive normalized state and derive presentation models.
4. Mutations are validated before repositories persist them.
5. Cloud pull and import paths pass through the same validation boundary.

## Quality gates

Every change must pass:

```bash
pnpm verify
```

This runs formatting, unit tests, type checks, bundle budgets, and production dependency audit.

## Performance rules

- Keep export, audio, and PDF dependencies out of the initial execution path.
- Preserve route-level code splitting.
- Do not add synchronous work over large song or chord lists on the main thread.
- Respect `scripts/check-bundle.mjs` budgets: 220 KB approximate initial JavaScript gzip and 160 KB per chunk gzip.
