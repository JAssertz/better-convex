/// <reference types="bun-types/test-globals" />
/** biome-ignore-all lint/suspicious/noVar: test */

declare var mock: typeof import('bun:test').mock;
declare var spyOn: typeof import('bun:test').spyOn;
