/**
 * JSON Schema dialect normalization for advertised tool schemas.
 *
 * The MCP SDK converts registered Zod schemas to JSON Schema with target
 * `draft-7` and exposes no option to change it — see
 * `@modelcontextprotocol/sdk/server/zod-json-schema-compat.js`, where
 * `mapMiniTarget(undefined)` returns `'draft-7'` and `mcp.js` never passes a
 * target (verified on SDK 1.29.0 and 1.30.0). Every advertised schema therefore
 * carries `"$schema": "http://json-schema.org/draft-07/schema#"`.
 *
 * Clients that compile `outputSchema` with an Ajv instance built for JSON Schema
 * 2020-12 refuse to compile a foreign dialect and reject the tool outright,
 * before the handler ever runs:
 *
 *   Tool 'list_devices' has an invalid outputSchema: JSON Schema declares an
 *   unsupported dialect ("$schema": "http://json-schema.org/draft-07/schema#").
 *
 * So the dialect is rewritten on the way out. This is a translation, not a
 * relabel: the draft-07-only constructs are converted to their 2020-12
 * equivalents as well, so the shim stays correct if the emitted schema shapes
 * ever grow beyond the plain `type`/`properties`/`required` forms in use today.
 *
 * TODO(sdk#2084): delete this module, `../transports/schema-dialect.ts`, and the
 * `connect` wrapper in `src/app/create-server.ts` once the SDK emits 2020-12
 * itself. Upstream tracking:
 *   - https://github.com/modelcontextprotocol/typescript-sdk/issues/2084
 *   - https://github.com/modelcontextprotocol/typescript-sdk/issues/2677
 *   - https://github.com/modelcontextprotocol/typescript-sdk/issues/2721
 *   - https://github.com/modelcontextprotocol/typescript-sdk/pull/2653
 *   - https://github.com/modelcontextprotocol/typescript-sdk/pull/2085
 * After bumping the SDK, `src/__test__/mcp/schema-dialect.test.ts` still asserts
 * the advertised dialect, so it will keep passing once the shim is removed.
 */

/** Canonical `$schema` for the dialect MCP clients validate against. */
export const JSON_SCHEMA_2020_12 =
  "https://json-schema.org/draft/2020-12/schema";

/** The dialect the SDK emits, which 2020-12-only validators reject. */
const DRAFT_07_SCHEMA_IDS = new Set([
  "http://json-schema.org/draft-07/schema#",
  "http://json-schema.org/draft-07/schema",
  "https://json-schema.org/draft-07/schema#",
  "https://json-schema.org/draft-07/schema",
]);

const DEFINITIONS_REF_PREFIX = "#/definitions/";
const DEFS_REF_PREFIX = "#/$defs/";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Splits a draft-07 `dependencies` map into its 2020-12 successors:
 * array values become `dependentRequired`, schema values `dependentSchemas`.
 */
function convertDependencies(
  dependencies: Record<string, unknown>,
  target: Record<string, unknown>,
): void {
  const dependentRequired: Record<string, unknown> = {};
  const dependentSchemas: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(dependencies)) {
    if (Array.isArray(value)) {
      dependentRequired[key] = value;
    } else {
      dependentSchemas[key] = toJsonSchema2020_12(value);
    }
  }

  // An explicit 2020-12 sibling wins over the converted draft-07 key, matching
  // how `definitions` yields to `$defs`.
  if (Object.keys(dependentRequired).length > 0) {
    target.dependentRequired = {
      ...dependentRequired,
      ...(isPlainObject(target.dependentRequired)
        ? target.dependentRequired
        : {}),
    };
  }
  if (Object.keys(dependentSchemas).length > 0) {
    target.dependentSchemas = {
      ...dependentSchemas,
      ...(isPlainObject(target.dependentSchemas)
        ? target.dependentSchemas
        : {}),
    };
  }
}

/**
 * Recursively rewrites a JSON Schema value from draft-07 to JSON Schema
 * 2020-12. Returns a new value; the input is never mutated. Values that are not
 * schema objects (or that already declare 2020-12) pass through unchanged apart
 * from the recursion.
 */
export function toJsonSchema2020_12(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(toJsonSchema2020_12);
  }
  if (!isPlainObject(schema)) {
    return schema;
  }

  const result: Record<string, unknown> = {};
  // These are folded in after the loop so the outcome never depends on JSON
  // member order: an explicit 2020-12 sibling wins, and `additionalItems` can
  // be judged against the final `items` form rather than whichever came first.
  let renamedDefs: Record<string, unknown> | undefined;
  let itemsWasTuple = false;
  let additionalItems: { value: unknown } | undefined;
  let dependencies: Record<string, unknown> | undefined;

  for (const [key, value] of Object.entries(schema)) {
    switch (key) {
      case "$schema":
        result.$schema =
          typeof value === "string" && DRAFT_07_SCHEMA_IDS.has(value)
            ? JSON_SCHEMA_2020_12
            : value;
        break;

      case "$ref":
        // `#/definitions/Foo` moves with the `definitions` → `$defs` rename.
        result.$ref =
          typeof value === "string" && value.startsWith(DEFINITIONS_REF_PREFIX)
            ? `${DEFS_REF_PREFIX}${value.slice(DEFINITIONS_REF_PREFIX.length)}`
            : value;
        break;

      // draft-07 `definitions` is 2020-12 `$defs`.
      case "definitions": {
        const converted = toJsonSchema2020_12(value);
        renamedDefs = isPlainObject(converted) ? converted : undefined;
        break;
      }

      // Tuple form `items: [A, B]` is 2020-12 `prefixItems`.
      case "items":
        if (Array.isArray(value)) {
          itemsWasTuple = true;
          result.prefixItems = value.map(toJsonSchema2020_12);
        } else {
          result.items = toJsonSchema2020_12(value);
        }
        break;

      case "additionalItems":
        additionalItems = { value };
        break;

      case "dependencies":
        if (isPlainObject(value)) {
          dependencies = value;
        } else {
          result.dependencies = toJsonSchema2020_12(value);
        }
        break;

      default:
        result[key] = toJsonSchema2020_12(value);
        break;
    }
  }

  if (renamedDefs) {
    result.$defs = {
      ...renamedDefs,
      ...(isPlainObject(result.$defs) ? result.$defs : {}),
    };
  }

  // draft-07 `additionalItems` applies ONLY when `items` is a tuple; with a
  // single-schema `items` (or none at all) it is ignored. Translating it
  // unconditionally would turn `{items: {type: "string"}, additionalItems: false}`
  // into `items: false` and reject every element.
  if (itemsWasTuple && additionalItems) {
    result.items = toJsonSchema2020_12(additionalItems.value);
  }

  if (dependencies) {
    convertDependencies(dependencies, result);
  }

  // A schema with no dialect is assumed 2020-12 by MCP clients, so only an
  // explicit draft-07 marker needed rewriting; nothing is added here.
  return result;
}
