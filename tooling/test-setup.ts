import { afterEach, expect, mock, spyOn } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import * as matchers from '@testing-library/jest-dom/matchers';

// Make mock and spyOn globally available to avoid needing to import from bun:test
(globalThis as Record<string, unknown>).mock = mock;
(globalThis as Record<string, unknown>).spyOn = spyOn;

// Register DOM globals synchronously for React/hook tests.
GlobalRegistrator.register();

// Ensure document.body exists (some environments only create documentElement).
if (globalThis.document && !globalThis.document.body) {
  const body = globalThis.document.createElement('body');
  globalThis.document.documentElement.appendChild(body);
}

// Extend Bun's expect with Testing Library matchers (toBeInTheDocument, etc.).
expect.extend(matchers);

// Import after DOM globals are registered so Testing Library binds `screen` correctly.
// Load at setup-time, not inside a running test hook, to avoid Bun 1.3+ hook-context errors.
const cleanupPromise = import('@testing-library/react').then(
  ({ cleanup }) => cleanup,
);

// Cleanup DOM between tests to avoid cross-test contamination.
afterEach(async () => {
  const cleanup = await cleanupPromise;
  cleanup();
});
