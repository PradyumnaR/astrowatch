# Testing

- Unit + integration: Vitest + Testing Library
- E2E: Playwright
- Unit tests: `src/__tests__/unit/`
- Integration tests: `src/__tests__/integration/`
- E2E tests: `e2e/`
- Run unit: `npm run test:unit`
- Run E2E: `npm run test:e2e`
- Always mock external APIs (N2YO, Open-Meteo, Celestrak) using `vi.fn()` — never call real APIs in tests
