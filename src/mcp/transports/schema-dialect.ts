/**
 * Transport shim that normalizes the JSON Schema dialect of advertised tool
 * schemas on outbound `tools/list` results.
 *
 * See `../schemas/json-schema-dialect.ts` for why this is needed: the MCP SDK
 * hard-codes a `draft-7` conversion target, and clients validating
 * `outputSchema` with a 2020-12-only Ajv reject every such tool.
 *
 * It sits at the transport rather than the request handler because the SDK
 * registers the `tools/list` handler internally and offers no seam to wrap it
 * without reaching into private state.
 */
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { toJsonSchema2020_12 } from "../schemas/json-schema-dialect.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeToolDefinition(tool: unknown): unknown {
  if (!isRecord(tool)) return tool;

  const normalized: Record<string, unknown> = { ...tool };
  if (tool.inputSchema !== undefined) {
    normalized.inputSchema = toJsonSchema2020_12(tool.inputSchema);
  }
  if (tool.outputSchema !== undefined) {
    normalized.outputSchema = toJsonSchema2020_12(tool.outputSchema);
  }
  return normalized;
}

/**
 * Rewrites the tool schemas in a `tools/list` result. Any other message —
 * requests, notifications, errors, other results — is returned untouched.
 */
export function normalizeOutboundMessage(
  message: JSONRPCMessage,
): JSONRPCMessage {
  // JSONRPCMessage is a union without a shared `result`, so read it structurally.
  const envelope = message as unknown as Record<string, unknown>;
  const result = envelope.result;
  if (!isRecord(result) || !Array.isArray(result.tools)) {
    return message;
  }

  return {
    ...envelope,
    result: {
      ...result,
      tools: result.tools.map(normalizeToolDefinition),
    },
  } as unknown as JSONRPCMessage;
}

/**
 * Wraps `transport.send` so every outbound `tools/list` result advertises JSON
 * Schema 2020-12. The transport is patched in place (and returned) so that
 * transport-specific members — `handleRequest`, `sessionId`, the `on*` setters —
 * keep working on the same object the caller holds.
 */
export function withNormalizedToolSchemas<T extends Transport>(
  transport: T,
): T {
  const send = transport.send.bind(transport);
  transport.send = (message, options) =>
    send(normalizeOutboundMessage(message), options);
  return transport;
}
