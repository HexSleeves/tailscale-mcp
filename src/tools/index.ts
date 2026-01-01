import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../logger.js";
import type { TailscaleAPI } from "../tailscale/tailscale-api.js";
import type { TailscaleCLI } from "../tailscale/tailscale-cli.js";
import type { UnifiedTailscaleClient } from "../tailscale/unified-client.js";
import { aclTools } from "./acl-tools.js";
import { adminTools } from "./admin-tools.js";
import { deviceTools } from "./device-tools.js";
import { networkTools } from "./network-tools.js";

export interface ToolContext {
  api: TailscaleAPI;
  cli: TailscaleCLI;
  client: UnifiedTailscaleClient;
}

export interface ToolDefinition<T extends z.ZodSchema = z.ZodSchema> {
  name: string;
  description: string;
  inputSchema: T;
  handler(args: z.infer<T>, context: ToolContext): Promise<CallToolResult>;
}

export interface ToolModule {
  tools: ToolDefinition[];
}

// Define the expected JSON Schema type for MCP tools
interface MCPJsonSchema {
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
  [key: string]: unknown;
}

// Helper function to convert Zod schema to JSON Schema
function zodToJsonSchema(schema: z.ZodSchema): MCPJsonSchema {
  try {
    const jsonSchema = z.toJSONSchema(schema);

    // Cast to unknown first then to compatible type since we know Zod objects produce valid JSON schemas
    // that conform to what MCP expects (mostly objects)
    return jsonSchema as unknown as MCPJsonSchema;
  } catch (error) {
    logger.error("Schema conversion failed:", error);
    return { type: "object", properties: {} };
  }
}

// Tool registry
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
  }

  async loadTools(): Promise<void> {
    logger.debug("Loading tools...");

    // Register all tool modules
    this.registerModule(deviceTools);
    this.registerModule(networkTools);
    this.registerModule(aclTools);
    this.registerModule(adminTools);

    logger.debug(`Loaded ${this.tools.size} tools`);
  }

  private registerModule(module: ToolModule): void {
    for (const tool of module.tools) {
      this.register(tool);
    }
  }

  private register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn(
        `Duplicate tool name detected: "${tool.name}" – overriding previous definition`
      );
    }
    this.tools.set(tool.name, tool);
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema),
    }));
  }

  async callTool(
    name: string,
    args?: Record<string, unknown>
  ): Promise<CallToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const validatedArgs = tool.inputSchema.safeParse(args);
      if (!validatedArgs.success) {
        logger.warn("Invalid arguments:", validatedArgs.error);

        return {
          content: [
            {
              type: "text",
              text: `Invalid arguments: ${validatedArgs.error.message}`,
            },
          ],
          isError: true,
        };
      }

      return await tool.handler(validatedArgs.data, this.context);
    } catch (error: unknown) {
      logger.error("Tool error:", error);

      return {
        content: [
          {
            type: "text",
            text: `Tool error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Dispose of resources held by the ToolRegistry and its context
   */
  async dispose(): Promise<void> {
    logger.debug("Disposing ToolRegistry resources...");

    // Clear the tools map
    this.tools.clear();

    // Note: TailscaleAPI uses Axios which doesn't require explicit cleanup
    // as it doesn't maintain persistent connections by default.
    // If in the future the API client maintains persistent connections,
    // we would add cleanup logic here.

    logger.debug("ToolRegistry resources disposed");
  }
}
