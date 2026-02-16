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

// Cleanup DOM between tests to avoid cross-test contamination.
let cleanup: undefined | (() => void);
afterEach(async () => {
  // Import after DOM globals are registered so Testing Library binds `screen` correctly.
  if (!cleanup) cleanup = (await import('@testing-library/react')).cleanup;
  cleanup();
});
