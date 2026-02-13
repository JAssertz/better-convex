const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Generic transformer contract (mirrors tRPC shape).
 */
export interface DataTransformer {
  serialize(object: any): any;
  deserialize(object: any): any;
}

/**
 * Separate input/output transformers.
 */
export interface CombinedDataTransformer {
  input: DataTransformer;
  output: DataTransformer;
}

/**
 * Transformer config accepted by cRPC.
 */
export type DataTransformerOptions = CombinedDataTransformer | DataTransformer;

/**
 * Extensible tagged wire codec.
 */
export interface WireCodec {
  readonly tag: `$${string}`;
  isType(value: unknown): boolean;
  encode(value: unknown): unknown;
  decode(value: unknown): unknown;
}

const CODEC_MARKER_KEY = '__crpc';
const CODEC_MARKER_VALUE = 1;
const CODEC_TAG_KEY = 't';
const CODEC_VALUE_KEY = 'v';

/**
 * Date wire tag (Convex-style reserved key).
 */
export const DATE_CODEC_TAG = '$date';

/**
 * Built-in Date codec.
 */
export const dateWireCodec: WireCodec = {
  tag: DATE_CODEC_TAG,
  isType: (value): value is Date => value instanceof Date,
  encode: (value) => (value as Date).getTime(),
  decode: (value) => {
    if (typeof value !== 'number') {
      return value;
    }
    return new Date(value);
  },
};

/**
 * Build a recursive tagged transformer from codecs.
 */
export const createTaggedTransformer = (
  codecs: readonly WireCodec[]
): DataTransformer => {
  const codecByTag = new Map<string, WireCodec>();
  for (const codec of codecs) {
    if (!codec.tag.startsWith('$')) {
      throw new Error(
        `Invalid wire codec tag '${codec.tag}'. Tags must start with '$'.`
      );
    }
    if (codecByTag.has(codec.tag)) {
      throw new Error(`Duplicate wire codec tag '${codec.tag}'.`);
    }
    codecByTag.set(codec.tag, codec);
  }

  const serialize = (value: unknown): unknown => {
    for (const codec of codecs) {
      if (codec.isType(value)) {
        return {
          [CODEC_MARKER_KEY]: CODEC_MARKER_VALUE,
          [CODEC_TAG_KEY]: codec.tag,
          [CODEC_VALUE_KEY]: serialize(codec.encode(value)),
        };
      }
    }

    if (Array.isArray(value)) {
      return value.map((item) => serialize(item));
    }

    if (isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value)) {
        result[key] = serialize(nested);
      }
      return result;
    }

    return value;
  };

  const deserialize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => deserialize(item));
    }

    if (isPlainObject(value)) {
      const marker = value[CODEC_MARKER_KEY];
      const tag = value[CODEC_TAG_KEY];
      if (
        marker === CODEC_MARKER_VALUE &&
        typeof tag === 'string' &&
        CODEC_VALUE_KEY in value &&
        Object.keys(value).length === 3
      ) {
        const codec = codecByTag.get(tag);
        if (codec) {
          return codec.decode(deserialize(value[CODEC_VALUE_KEY]));
        }
      }

      const entries = Object.entries(value);
      const result: Record<string, unknown> = {};
      for (const [key, nested] of entries) {
        result[key] = deserialize(nested);
      }
      return result;
    }

    return value;
  };

  return {
    serialize,
    deserialize,
  };
};

/**
 * Default cRPC transformer (Date-enabled).
 */
export const defaultCRPCTransformer: DataTransformer = createTaggedTransformer([
  dateWireCodec,
]);

const IDENTITY_TRANSFORMER: CombinedDataTransformer = {
  input: {
    serialize: (value) => value,
    deserialize: (value) => value,
  },
  output: {
    serialize: (value) => value,
    deserialize: (value) => value,
  },
};

/**
 * Normalize transformer config to split input/output shape.
 */
const normalizeCustomTransformer = (
  transformer?: DataTransformerOptions
): CombinedDataTransformer | undefined => {
  if (!transformer) {
    return;
  }

  if ('input' in transformer && 'output' in transformer) {
    return transformer;
  }

  return {
    input: transformer,
    output: transformer,
  };
};

/**
 * Compose user transformer with default Date transformer.
 *
 * Date transformer is always active:
 * - serialize: user -> default(Date)
 * - deserialize: default(Date) -> user
 */
const composeWithDefault = (transformer?: DataTransformer): DataTransformer => {
  if (!transformer) {
    return defaultCRPCTransformer;
  }

  return {
    serialize: (value) =>
      defaultCRPCTransformer.serialize(transformer.serialize(value)),
    deserialize: (value) =>
      transformer.deserialize(defaultCRPCTransformer.deserialize(value)),
  };
};

/**
 * Normalize transformer config to split input/output shape.
 * User transformers are additive and always composed with default Date handling.
 */
export const getTransformer = (
  transformer?: DataTransformerOptions
): CombinedDataTransformer => {
  const custom = normalizeCustomTransformer(transformer);
  return {
    input: composeWithDefault(custom?.input),
    output: composeWithDefault(custom?.output),
  };
};

/**
 * Encode request payloads (input direction).
 */
export const encodeWire = (
  value: unknown,
  transformer?: DataTransformerOptions
): unknown => getTransformer(transformer).input.serialize(value);

/**
 * Decode response payloads (output direction).
 */
export const decodeWire = (
  value: unknown,
  transformer?: DataTransformerOptions
): unknown => getTransformer(transformer).output.deserialize(value);

/**
 * Exposed identity transformer for advanced composition.
 */
export const identityTransformer: CombinedDataTransformer =
  IDENTITY_TRANSFORMER;
