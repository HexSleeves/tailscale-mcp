/**
 * JSON Schema dialect normalization tests.
 *
 * Importers: none — new test file
 * Affected surface: src/mcp/schemas/json-schema-dialect.ts,
 *   src/mcp/transports/schema-dialect.ts, src/app/create-server.ts
 * Data files: none
 *
 * Regression guard: the MCP SDK converts registered Zod schemas with a
 * hard-coded `draft-7` target, and clients that compile `outputSchema` against a
 * JSON Schema 2020-12-only Ajv instance reject every such tool before its
 * handler runs.
 */
import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  CallToolResult,
  JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import * as z4mini from "zod/v4-mini";
import { createMcpServer } from "../../app/create-server.js";
import {
  JSON_SCHEMA_2020_12,
  toJsonSchema2020_12,
} from "../../mcp/schemas/json-schema-dialect.js";
import * as outputSchemas from "../../mcp/schemas/tool-results.js";
import {
  normalizeOutboundMessage,
  withNormalizedToolSchemas,
} from "../../mcp/transports/schema-dialect.js";
import { makeConfig, makeFakeService, silentLogger } from "./helpers.js";

const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

describe("toJsonSchema2020_12", () => {
  test("rewrites the draft-07 dialect marker", () => {
    const result = toJsonSchema2020_12({
      $schema: DRAFT_07,
      type: "object",
    }) as Record<string, unknown>;

    expect(result.$schema).toBe(JSON_SCHEMA_2020_12);
    expect(result.type).toBe("object");
  });

  test("leaves an existing 2020-12 marker and unmarked schemas alone", () => {
    const alreadyCurrent = toJsonSchema2020_12({
      $schema: JSON_SCHEMA_2020_12,
    }) as Record<string, unknown>;

    expect(alreadyCurrent.$schema).toBe(JSON_SCHEMA_2020_12);
    expect(toJsonSchema2020_12({ type: "string" })).toEqual({ type: "string" });
  });

  test("does not mutate its input", () => {
    const input = { $schema: DRAFT_07, properties: { a: { type: "string" } } };
    toJsonSchema2020_12(input);
    expect(input.$schema).toBe(DRAFT_07);
  });

  test("renames definitions to $defs and retargets its refs", () => {
    const result = toJsonSchema2020_12({
      $schema: DRAFT_07,
      definitions: { Device: { type: "object" } },
      properties: { device: { $ref: "#/definitions/Device" } },
    }) as Record<string, unknown>;

    expect(result.$defs).toEqual({ Device: { type: "object" } });
    expect(result.definitions).toBeUndefined();
    expect(result.properties).toEqual({ device: { $ref: "#/$defs/Device" } });
  });

  test("an explicit $defs sibling wins over a renamed definitions block", () => {
    const result = toJsonSchema2020_12({
      definitions: { A: { type: "string" } },
      $defs: { A: { type: "number" } },
    }) as Record<string, unknown>;

    expect(result.$defs).toEqual({ A: { type: "number" } });
  });

  test("converts tuple items to prefixItems and additionalItems to items", () => {
    const result = toJsonSchema2020_12({
      type: "array",
      items: [{ type: "string" }, { type: "number" }],
      additionalItems: false,
    }) as Record<string, unknown>;

    expect(result.prefixItems).toEqual([
      { type: "string" },
      { type: "number" },
    ]);
    expect(result.items).toBe(false);
    expect(result.additionalItems).toBeUndefined();
  });

  test("keeps single-schema items as items", () => {
    const result = toJsonSchema2020_12({
      type: "array",
      items: { type: "string" },
    }) as Record<string, unknown>;

    expect(result.items).toEqual({ type: "string" });
    expect(result.prefixItems).toBeUndefined();
  });

  test("splits dependencies into dependentRequired and dependentSchemas", () => {
    const result = toJsonSchema2020_12({
      dependencies: {
        creditCard: ["billingAddress"],
        shipping: { required: ["address"] },
      },
    }) as Record<string, unknown>;

    expect(result.dependentRequired).toEqual({
      creditCard: ["billingAddress"],
    });
    expect(result.dependentSchemas).toEqual({
      shipping: { required: ["address"] },
    });
    expect(result.dependencies).toBeUndefined();
  });

  test("recurses through nested schemas and arrays", () => {
    const result = toJsonSchema2020_12({
      anyOf: [{ $schema: DRAFT_07, type: "string" }],
      properties: { nested: { $schema: DRAFT_07, type: "number" } },
    }) as Record<string, unknown>;

    const anyOf = result.anyOf as Record<string, unknown>[];
    const properties = result.properties as Record<
      string,
      Record<string, unknown>
    >;

    expect(anyOf[0].$schema).toBe(JSON_SCHEMA_2020_12);
    expect(properties.nested.$schema).toBe(JSON_SCHEMA_2020_12);
  });
});

describe("normalizeOutboundMessage", () => {
  test("normalizes both schemas on every tool in a tools/list result", () => {
    const message = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          {
            name: "list_devices",
            inputSchema: { $schema: DRAFT_07, type: "object" },
            outputSchema: { $schema: DRAFT_07, type: "object" },
          },
        ],
      },
    } as unknown as JSONRPCMessage;

    const result = normalizeOutboundMessage(message) as unknown as {
      result: {
        tools: {
          name: string;
          inputSchema: Record<string, unknown>;
          outputSchema: Record<string, unknown>;
        }[];
      };
    };
    const [tool] = result.result.tools;

    expect(tool.name).toBe("list_devices");
    expect(tool.inputSchema.$schema).toBe(JSON_SCHEMA_2020_12);
    expect(tool.outputSchema.$schema).toBe(JSON_SCHEMA_2020_12);
  });

  test("passes non-tools/list messages through untouched", () => {
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list_devices" },
    } as unknown as JSONRPCMessage;
    const callResult = {
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text: "{}" }] },
    } as unknown as JSONRPCMessage;
    const errorResponse = {
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32603, message: "boom" },
    } as unknown as JSONRPCMessage;

    expect(normalizeOutboundMessage(request)).toBe(request);
    expect(normalizeOutboundMessage(callResult)).toBe(callResult);
    expect(normalizeOutboundMessage(errorResponse)).toBe(errorResponse);
  });
});

describe("withNormalizedToolSchemas", () => {
  test("normalizes outbound messages and preserves transport members", async () => {
    const sent: JSONRPCMessage[] = [];
    const transport = {
      sessionId: "session-1",
      start: async () => {},
      close: async () => {},
      send: async (message: JSONRPCMessage) => {
        sent.push(message);
      },
    } as unknown as Transport & { sessionId: string };

    const wrapped = withNormalizedToolSchemas(transport);
    expect(wrapped).toBe(transport);
    expect(wrapped.sessionId).toBe("session-1");

    await wrapped.send({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "t", outputSchema: { $schema: DRAFT_07 } }] },
    } as unknown as JSONRPCMessage);

    const delivered = sent[0] as unknown as {
      result: { tools: { outputSchema: Record<string, unknown> }[] };
    };
    expect(delivered.result.tools[0].outputSchema.$schema).toBe(
      JSON_SCHEMA_2020_12,
    );
  });
});

describe("tools/list over a connected transport", () => {
  async function connectClient() {
    const server = await createMcpServer({
      config: makeConfig({ TAILSCALE_ALLOWED_TOOL_RISK: "admin" }),
      logger: silentLogger,
      tailscale: makeFakeService(),
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    return {
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  test("no advertised schema declares the draft-07 dialect", async () => {
    const { client, close } = await connectClient();
    try {
      const { tools } = await client.listTools();

      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(JSON.stringify(tool)).not.toContain("draft-07");
        expect((tool.inputSchema as Record<string, unknown>).$schema).toBe(
          JSON_SCHEMA_2020_12,
        );
        expect(
          (tool.outputSchema as Record<string, unknown> | undefined)?.$schema,
        ).toBe(JSON_SCHEMA_2020_12);
      }
    } finally {
      await close();
    }
  });

  test("no advertised schema uses a draft-07-only construct", async () => {
    const { client, close } = await connectClient();
    try {
      const { tools } = await client.listTools();

      const walk = (node: unknown, path: string): void => {
        if (Array.isArray(node)) {
          node.forEach((child, index) => {
            walk(child, `${path}[${index}]`);
          });
          return;
        }
        if (typeof node !== "object" || node === null) return;

        const record = node as Record<string, unknown>;
        for (const key of ["definitions", "additionalItems", "dependencies"]) {
          expect(record[key], `${path}.${key}`).toBeUndefined();
        }
        // Tuple-form `items` is draft-07 only; 2020-12 spells it `prefixItems`.
        expect(Array.isArray(record.items), `${path}.items is a tuple`).toBe(
          false,
        );
        if (typeof record.$ref === "string") {
          expect(record.$ref, `${path}.$ref`).not.toContain("#/definitions/");
        }

        for (const [key, value] of Object.entries(record)) {
          walk(value, `${path}.${key}`);
        }
      };

      for (const tool of tools) {
        walk(tool.inputSchema, `${tool.name}.inputSchema`);
        walk(tool.outputSchema, `${tool.name}.outputSchema`);
      }
    } finally {
      await close();
    }
  });

  test("normalization is lossless for the shipped output schemas", () => {
    // Proves the rewrite is a faithful translation and not just a relabel: each
    // normalized schema matches what Zod itself emits when asked for 2020-12.
    for (const [name, schema] of Object.entries(outputSchemas)) {
      const viaDraft07 = toJsonSchema2020_12(
        z4mini.toJSONSchema(schema as never, {
          target: "draft-7",
          io: "output",
        }),
      );
      const direct = z4mini.toJSONSchema(schema as never, {
        target: "draft-2020-12",
        io: "output",
      });

      expect(viaDraft07, name).toEqual(direct);
    }
  });

  test("a tool call still returns validated structured content", async () => {
    const { client, close } = await connectClient();
    try {
      // The client compiles `outputSchema` and validates `structuredContent`
      // against it, so reaching a non-error result exercises the whole path.
      const result = (await client.callTool({
        name: "list_devices",
        arguments: { includeRoutes: false, includeOffline: true },
      })) as CallToolResult;

      expect(result.isError ?? false).toBe(false);
      expect(
        (result.structuredContent as { devices: { id: string }[] }).devices[0]
          .id,
      ).toBe("device-1");
    } finally {
      await close();
    }
  });
});
