import { describe, expect, test } from 'bun:test';

import {
  decodeDeveloperDocumentId,
  encodeDeveloperDocumentId,
  remapDeveloperDocumentIdTable,
} from './id-v6';

const BASE32_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

const buildInternalId = (): Uint8Array => {
  const internalId = new Uint8Array(16);
  internalId[0] = 251;
  for (let index = 1; index < 16; index += 1) {
    internalId[index] = (internalId[index - 1] * 251) % 256;
  }
  return internalId;
};

const vintEncode = (value: number): Uint8Array => {
  const bytes: number[] = [];
  let current = value >>> 0;

  while (true) {
    if (current < 0x80) {
      bytes.push(current);
      break;
    }
    bytes.push((current & 0x7f) | 0x80);
    current >>>= 7;
  }

  return Uint8Array.from(bytes);
};

const fletcher16 = (bytes: Uint8Array): number => {
  let c0 = 0;
  let c1 = 0;
  for (const byte of bytes) {
    c0 = (c0 + byte) & 0xff;
    c1 = (c1 + c0) & 0xff;
  }
  return (c1 << 8) | c0;
};

const base32Encode = (bytes: Uint8Array): string => {
  let output = '';
  let value = 0;
  let bits = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return output;
};

describe('id-v6 codec', () => {
  test('matches Convex id_v6 stability vector', () => {
    const encoded = encodeDeveloperDocumentId({
      tableNumber: 1017,
      internalId: buildInternalId(),
    });

    expect(encoded).toBe('z43zp6c3e75gkmz1kfwj6mbbx5sw281h');
  });

  test('decode rejects invalid base32', () => {
    expect(() =>
      decodeDeveloperDocumentId('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
    ).toThrow(/valid base32/i);
  });

  test('decode rejects invalid footer version', () => {
    const tableBytes = vintEncode(1017);
    const internalId = buildInternalId();
    const payload = new Uint8Array(tableBytes.length + internalId.length);
    payload.set(tableBytes, 0);
    payload.set(internalId, tableBytes.length);

    const expectedFooter = fletcher16(payload) ^ 0;
    const invalidFooter = expectedFooter ^ 1;

    const full = new Uint8Array(payload.length + 2);
    full.set(payload, 0);
    full[payload.length] = invalidFooter & 0xff;
    full[payload.length + 1] = (invalidFooter >> 8) & 0xff;

    const tamperedId = base32Encode(full);
    expect(() => decodeDeveloperDocumentId(tamperedId)).toThrow(
      /Invalid ID version/i
    );
  });

  test('decode rejects known non-canonical encoding', () => {
    expect(() =>
      decodeDeveloperDocumentId('mz1xn7tymdnktmmzqy5xxhn7tjs2nkkfmtjjr')
    ).toThrow();
  });

  test('remap changes only table number and preserves internal id bytes', () => {
    const original = encodeDeveloperDocumentId({
      tableNumber: 13,
      internalId: buildInternalId(),
    });

    const remapped = remapDeveloperDocumentIdTable(original, 77);

    const originalDecoded = decodeDeveloperDocumentId(original);
    const remappedDecoded = decodeDeveloperDocumentId(remapped);

    expect(remappedDecoded.tableNumber).toBe(77);
    expect(Array.from(remappedDecoded.internalId)).toEqual(
      Array.from(originalDecoded.internalId)
    );
    expect(remapped).not.toBe(original);
  });
});
