const BASE32_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

const MIN_TABLE_NUMBER_LEN = 1;
const MAX_TABLE_NUMBER_LEN = 5;
const INTERNAL_ID_LEN = 16;
const FOOTER_LEN = 2;
const VERSION = 0;

const MIN_BINARY_LEN = MIN_TABLE_NUMBER_LEN + INTERNAL_ID_LEN + FOOTER_LEN;
const MAX_BINARY_LEN = MAX_TABLE_NUMBER_LEN + INTERNAL_ID_LEN + FOOTER_LEN;

const base32EncodedLen = (byteLength: number): number =>
  Math.ceil((byteLength * 8) / 5);

const MIN_BASE32_LEN = base32EncodedLen(MIN_BINARY_LEN);
const MAX_BASE32_LEN = base32EncodedLen(MAX_BINARY_LEN);

export type DecodedDeveloperDocumentId = {
  internalId: Uint8Array;
  tableNumber: number;
};

export class IdDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdDecodeError';
  }
}

const assertValidTableNumber = (tableNumber: number): void => {
  if (!Number.isInteger(tableNumber) || tableNumber <= 0) {
    throw new IdDecodeError('Unable to encode ID: Invalid table number');
  }

  if (tableNumber > 0xffffffff) {
    throw new IdDecodeError('Unable to encode ID: Invalid table number');
  }
};

const assertValidInternalId = (internalId: Uint8Array): void => {
  if (internalId.length !== INTERNAL_ID_LEN) {
    throw new IdDecodeError(
      `Unable to encode ID: Invalid internal ID length ${internalId.length}`,
    );
  }
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

const vintDecode = (buffer: Uint8Array): { bytesRead: number; value: number } => {
  let position = 0;
  let value = 0;

  for (let index = 0; ; index += 1) {
    if (index >= 5) {
      throw new IdDecodeError('Unable to decode ID: Invalid table number');
    }

    const byte = buffer[position];
    if (byte === undefined) {
      throw new IdDecodeError('Unable to decode ID: Invalid table number');
    }

    value |= (byte & 0x7f) << (index * 7);
    position += 1;

    if ((byte & 0x80) === 0) {
      break;
    }
  }

  return { bytesRead: position, value: value >>> 0 };
};

const fletcher16 = (buffer: Uint8Array): number => {
  let c0 = 0;
  let c1 = 0;

  for (const byte of buffer) {
    c0 = (c0 + byte) & 0xff;
    c1 = (c1 + c0) & 0xff;
  }

  return (c1 << 8) | c0;
};

const base32Encode = (buffer: Uint8Array): string => {
  let value = 0;
  let bits = 0;
  let output = '';

  for (const byte of buffer) {
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

const base32Decode = (id: string): Uint8Array => {
  const decodeMap = new Map<string, number>();
  for (const [index, char] of Array.from(BASE32_ALPHABET).entries()) {
    decodeMap.set(char, index);
  }

  let value = 0;
  let bits = 0;
  const output: number[] = [];

  for (const char of id.toLowerCase()) {
    const mapped = decodeMap.get(char);
    if (mapped === undefined) {
      throw new IdDecodeError("Unable to decode ID: ID wasn't valid base32");
    }

    value = (value << 5) | mapped;
    bits += 5;

    while (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Uint8Array.from(output);
};

export const encodeDeveloperDocumentId = ({
  internalId,
  tableNumber,
}: DecodedDeveloperDocumentId): string => {
  assertValidTableNumber(tableNumber);
  assertValidInternalId(internalId);

  const tableBytes = vintEncode(tableNumber);

  const payload = new Uint8Array(tableBytes.length + internalId.length);
  payload.set(tableBytes, 0);
  payload.set(internalId, tableBytes.length);

  const footer = fletcher16(payload) ^ VERSION;

  const full = new Uint8Array(payload.length + FOOTER_LEN);
  full.set(payload, 0);
  full[payload.length] = footer & 0xff;
  full[payload.length + 1] = (footer >> 8) & 0xff;

  return base32Encode(full);
};

export const decodeDeveloperDocumentId = (
  encodedId: string,
): DecodedDeveloperDocumentId => {
  if (encodedId.length < MIN_BASE32_LEN || encodedId.length > MAX_BASE32_LEN) {
    throw new IdDecodeError(
      `Unable to decode ID: Invalid ID length ${encodedId.length}`,
    );
  }

  const buffer = base32Decode(encodedId);

  let position = 0;
  const { bytesRead, value } = vintDecode(buffer.subarray(position));
  position += bytesRead;

  if (value === 0) {
    throw new IdDecodeError('Unable to decode ID: Invalid table number');
  }

  const internalId = buffer.slice(position, position + INTERNAL_ID_LEN);
  if (internalId.length !== INTERNAL_ID_LEN) {
    throw new IdDecodeError(
      `Unable to decode ID: Invalid ID length ${encodedId.length}`,
    );
  }
  position += INTERNAL_ID_LEN;

  const footerBytes = buffer.slice(position, position + FOOTER_LEN);
  if (footerBytes.length !== FOOTER_LEN) {
    throw new IdDecodeError(
      `Unable to decode ID: Invalid ID length ${encodedId.length}`,
    );
  }

  const expectedFooter = fletcher16(buffer.subarray(0, position)) ^ VERSION;
  const actualFooter = footerBytes[0] | (footerBytes[1] << 8);
  position += FOOTER_LEN;

  if (actualFooter !== expectedFooter) {
    throw new IdDecodeError(
      `Unable to decode ID: Invalid ID version ${actualFooter} (expected ${expectedFooter})`,
    );
  }

  if (position !== buffer.length) {
    throw new IdDecodeError(
      `Unable to decode ID: Invalid ID length ${encodedId.length}`,
    );
  }

  const decoded = {
    internalId,
    tableNumber: value,
  } satisfies DecodedDeveloperDocumentId;

  if (encodeDeveloperDocumentId(decoded) !== encodedId) {
    throw new IdDecodeError(
      `Unable to decode ID: Invalid ID length ${encodedId.length}`,
    );
  }

  return decoded;
};

export const remapDeveloperDocumentIdTable = (
  encodedId: string,
  newTableNumber: number,
): string => {
  const decoded = decodeDeveloperDocumentId(encodedId);
  return encodeDeveloperDocumentId({
    internalId: decoded.internalId,
    tableNumber: newTableNumber,
  });
};
