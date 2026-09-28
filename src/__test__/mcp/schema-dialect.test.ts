/**
 * JSON Schema dialect normalization tests.
 *
 * Importers: none — new test file
 * Affected surface: src/mcp/schemas/json-schema-dialect.ts,
 *   src/app/create-server.ts
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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z4mini from "zod/v4-mini";
import { createMcpServer } from "../../app/create-server.js";
import {
  advertiseToolSchemasAs2020_12,
  JSON_SCHEMA_2020_12,
  withDialect2020_12,
} from "../../mcp/schemas/json-schema-dialect.js";
import * as outputSchemas from "../../mcp/schemas/tool-results.js";
import { makeConfig, makeFakeService, silentLogger } from "./helpers.js";

const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

describe("withDialect2020_12", () => {
  test("rewrites the draft-07 dialect marker", () => {
    const result = withDialect2020_12({ $schema: DRAFT_07, type: "object" });

    expect(result).toEqual({ $schema: JSON_SCHEMA_2020_12, type: "object" });
  });

  test("leaves an existing 2020-12 marker, unmarked schemas and non-objects alone", () => {
    const current = { $schema: JSON_SCHEMA_2020_12 };
    const unmarked = { type: "string" };

    expect(withDialect2020_12(current)).toBe(current);
    expect(withDialect2020_12(unmarked)).toBe(unmarked);
    expect(withDialect2020_12(true)).toBe(true);
    expect(withDialect2020_12(null)).toBe(null);
  });

  test("does not mutate its input", () => {
    const input = { $schema: DRAFT_07, properties: { a: { type: "string" } } };
    withDialect2020_12(input);
    expect(input.$schema).toBe(DRAFT_07);
  });

  test("touches only the root marker, never nested values", () => {
    // Property names and literal values are data, not schema keywords.
    const input = {
      $schema: DRAFT_07,
      properties: { definitions: { type: "string" } },
      required: ["definitions"],
      default: { $schema: DRAFT_07, items: [1, 2] },
    };

    const result = withDialect2020_12(input);

    expect(result.properties).toBe(input.properties);
    expect(result.required).toBe(input.required);
    expect(result.default).toBe(input.default);
  });
});

describe("advertiseToolSchemasAs2020_12", () => {
  test("wraps only the tools/list handler", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    advertiseToolSchemasAs2020_12(server);
    server.registerPrompt("p", { description: "d" }, () => ({ messages: [] }));

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      const { prompts } = await client.listPrompts();
      expect(prompts.map((prompt) => prompt.name)).toEqual(["p"]);
    } finally {
      await client.close();
      await server.close();
    }
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
    // Proves the root relabel is exact for what ships: each relabelled schema
    // matches what Zod itself emits when asked for 2020-12.
    for (const [name, schema] of Object.entries(outputSchemas)) {
      const viaDraft07 = withDialect2020_12(
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
