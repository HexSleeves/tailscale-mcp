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

/**
 * Keywords that annotate or identify rather than assert. draft-07 ignores every
 * sibling of `$ref`; these are harmless to carry across, assertions are not.
 */
const ANNOTATION_KEYWORDS = new Set([
  "$anchor",
  "$comment",
  "$defs",
  "$id",
  "$schema",
  "default",
  "deprecated",
  "description",
  "examples",
  "readOnly",
  "title",
  "writeOnly",
]);

/**
 * Lists every construct in a schema SDK-emitted as draft-07 whose meaning would
 * change under the root-only 2020-12 relabel. Empty means the relabel is exact.
 *
 * Only for schemas that started as draft-07: a schema authored against 2020-12
 * may legitimately give `$ref` assertion siblings, which this would flag.
 */
function draft07OnlyConstructs(node: unknown, path: string): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) =>
      draft07OnlyConstructs(child, `${path}[${index}]`),
    );
  }
  if (typeof node !== "object" || node === null) return [];

  const record = node as Record<string, unknown>;
  const found: string[] = [];
  for (const key of ["definitions", "additionalItems", "dependencies"]) {
    if (key in record) found.push(`${path}.${key}`);
  }
  // Tuple-form `items` is draft-07 only; 2020-12 spells it `prefixItems`.
  if (Array.isArray(record.items)) found.push(`${path}.items is a tuple`);
  if (typeof record.$ref === "string") {
    if (record.$ref.includes("#/definitions/")) found.push(`${path}.$ref`);
    // draft-07 ignores `$ref` siblings; 2020-12 applies them, so an assertion
    // beside a `$ref` would start validating after the relabel.
    for (const key of Object.keys(record)) {
      if (key !== "$ref" && !ANNOTATION_KEYWORDS.has(key)) {
        found.push(`${path}.${key} beside $ref`);
      }
    }
  }

  for (const [key, value] of Object.entries(record)) {
    found.push(...draft07OnlyConstructs(value, `${path}.${key}`));
  }
  return found;
}

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

describe("draft07OnlyConstructs", () => {
  test("flags an assertion beside a $ref", () => {
    expect(
      draft07OnlyConstructs(
        { properties: { device: { $ref: "#/$defs/Device", type: "object" } } },
        "s",
      ),
    ).toEqual(["s.properties.device.type beside $ref"]);
  });

  test("allows annotations beside a $ref and Zod's recursion shape", () => {
    expect(
      draft07OnlyConstructs(
        {
          properties: {
            device: { $ref: "#/$defs/Device", description: "a device" },
            child: { allOf: [{ $ref: "#" }] },
          },
        },
        "s",
      ),
    ).toEqual([]);
  });

  test("flags the renamed draft-07 keywords", () => {
    expect(
      draft07OnlyConstructs(
        { definitions: {}, items: [{}], additionalItems: false },
        "s",
      ),
    ).toEqual(["s.definitions", "s.additionalItems", "s.items is a tuple"]);
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

      for (const tool of tools) {
        expect(
          draft07OnlyConstructs(tool.inputSchema, `${tool.name}.inputSchema`),
        ).toEqual([]);
        expect(
          draft07OnlyConstructs(tool.outputSchema, `${tool.name}.outputSchema`),
        ).toEqual([]);
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
      // `listTools` is what makes the client compile each `outputSchema`; without
      // it `callTool` skips validating `structuredContent`. Reaching a non-error
      // result then exercises the advertised schema and the result together.
      await client.listTools();
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
