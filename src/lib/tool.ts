import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodObject, ZodRawShape, z } from "zod";
import { getErrorMessage } from "../errors.ts";
import type { Logger } from "../logger.ts";

export interface ToolContext {
  log: Logger;
  [key: string]: unknown;
}

export interface ToolDefinition<
  I extends ZodObject<ZodRawShape>,
  O extends ZodObject<ZodRawShape> | undefined = undefined,
> {
  name: string;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema?: O;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  handler(
    args: z.infer<I>,
    ctx: ToolContext,
  ): Promise<
    string | (O extends ZodObject<ZodRawShape> ? z.infer<O> : unknown)
  >;
}

export function defineTool<
  I extends ZodObject<ZodRawShape>,
  O extends ZodObject<ZodRawShape> | undefined = undefined,
>(server: McpServer, ctx: ToolContext, def: ToolDefinition<I, O>): void {
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.inputSchema.shape,
      outputSchema: def.outputSchema?.shape,
      annotations: def.annotations,
    },
    async (args): Promise<CallToolResult> => {
      try {
        const result = await def.handler(args as z.infer<I>, ctx);
        if (typeof result === "string") {
          return { content: [{ type: "text", text: result }] };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (err) {
        ctx.log.error({ err, tool: def.name });
        return {
          isError: true,
          content: [{ type: "text", text: getErrorMessage(err) }],
        };
      }
    },
  );
}
