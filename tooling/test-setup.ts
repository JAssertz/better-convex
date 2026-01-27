import { mock, spyOn } from 'bun:test';

// Make mock and spyOn globally available to avoid needing to import from bun:test
(globalThis as Record<string, unknown>).mock = mock;
(globalThis as Record<string, unknown>).spyOn = spyOn;
