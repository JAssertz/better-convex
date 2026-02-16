/// <reference types="bun-types/test-globals" />
/** biome-ignore-all lint/suspicious/noVar: test */

declare var mock: typeof import('bun:test').mock;
declare var spyOn: typeof import('bun:test').spyOn;

// Bun exposes `undici` at runtime for Node compatibility, but it isn't a
// workspace dependency, so TypeScript can't resolve types without this shim.
declare module 'undici' {
  export const Request: typeof globalThis.Request;
}
