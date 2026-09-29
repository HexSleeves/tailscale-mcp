/**
 * JSON Schema dialect normalization for advertised tool schemas.
 *
 * The MCP SDK converts registered Zod schemas to JSON Schema with target
 * `draft-7` and exposes no option to change it — see
 * `@modelcontextprotocol/sdk/server/zod-json-schema-compat.js`, where
 * `mapMiniTarget(undefined)` returns `'draft-7'` and `mcp.js` never passes a
 * target (verified on SDK 1.29.0 and 1.30.1). Every advertised schema therefore
 * carries `"$schema": "http://json-schema.org/draft-07/schema#"`.
 *
 * Clients that compile `outputSchema` with an Ajv instance built for JSON Schema
 * 2020-12 refuse to compile a foreign dialect and reject the tool outright,
 * before the handler ever runs:
 *
 *   Tool 'list_devices' has an invalid outputSchema: JSON Schema declares an
 *   unsupported dialect ("$schema": "http://json-schema.org/draft-07/schema#").
 *
 * Only the root `$schema` marker is rewritten. The schemas this server emits use
 * no construct whose meaning differs between the two dialects (assertions
 * beside `$ref`, tuple `items`, `additionalItems`, `dependencies`), so the
 * relabel is exact. `src/__test__/mcp/schema-dialect.test.ts` walks every advertised schema
 * and fails if one ever appears, at which point a real translation is needed.
 *
 * TODO(sdk#2084): delete this module and its call in `src/app/create-server.ts`
 * once the SDK emits 2020-12 itself. Upstream tracking:
 *   - https://github.com/modelcontextprotocol/typescript-sdk/issues/2084
 *   - https://github.com/modelcontextprotocol/typescript-sdk/issues/2677
 *   - https://github.com/modelcontextprotocol/typescript-sdk/issues/2721
 *   - https://github.com/modelcontextprotocol/typescript-sdk/pull/2653
 *   - https://github.com/modelcontextprotocol/typescript-sdk/pull/2085
 * After bumping the SDK, the test above still asserts the advertised dialect,
 * so it will keep passing once the shim is removed.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";

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

/**
 * Relabels a root draft-07 `$schema` as 2020-12. Anything else — no marker, a
 * different dialect, a non-object — is returned as is. Never mutates the input.
 */
export function withDialect2020_12<T>(schema: T): T {
  if (
    typeof schema !== "object" ||
    schema === null ||
    !DRAFT_07_SCHEMA_IDS.has(
      (schema as { $schema?: unknown }).$schema as string,
    )
  ) {
    return schema;
  }
  return { ...schema, $schema: JSON_SCHEMA_2020_12 };
}

/**
 * Makes the server's `tools/list` handler advertise JSON Schema 2020-12.
 *
 * `McpServer` installs that handler lazily, on the first `registerTool`, so this
 * must run BEFORE any tool is registered. It intercepts the registration by
 * method (via the `ListToolsRequestSchema` it is keyed on) and wraps the SDK's
 * handler; every other method registers untouched.
 */
export function advertiseToolSchemasAs2020_12(server: McpServer): void {
  const protocol = server.server;
  type SetRequestHandler = typeof protocol.setRequestHandler;
  type Handler = (...args: unknown[]) => unknown;
  // Loosely typed: the SDK's generic signature cannot be re-implemented without
  // re-deriving its request/result types, and only the schema identity matters.
  const setRequestHandler = protocol.setRequestHandler.bind(protocol) as (
    schema: unknown,
    handler: Handler,
  ) => void;

  protocol.setRequestHandler = ((schema: unknown, handler: Handler) => {
    if (schema !== ListToolsRequestSchema) {
      setRequestHandler(schema, handler);
      return;
    }
    setRequestHandler(schema, async (...args: unknown[]) => {
      const result = (await handler(...args)) as ListToolsResult;
      return {
        ...result,
        tools: result.tools.map((tool) => ({
          ...tool,
          inputSchema: withDialect2020_12(tool.inputSchema),
          ...(tool.outputSchema && {
            outputSchema: withDialect2020_12(tool.outputSchema),
          }),
        })),
      };
    });
  }) as SetRequestHandler;
}
