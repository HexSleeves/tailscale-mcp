import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 500,
    readonly safeMessage = "Operation failed",
  ) {
    super(message);
  }
}

export function toMcpError(error: unknown): CallToolResult {
  // NOTE: tools advertise an `outputSchema`. MCP clients validate a result's
  // `structuredContent` against that schema even on error results. An error
  // shape (`{ error: ... }`) does not conform to schemas like
  // `{ data }`/`{ message }`, so attaching it made every failed call surface
  // the opaque "structured content does not match the output schema" and
  // hid the real error. Error results intentionally omit `structuredContent`;
  // the actionable message stays in the text content.
  if (error instanceof AppError) {
    return {
      isError: true,
      content: [{ type: "text", text: error.safeMessage }],
    };
  }

  if (error instanceof Error) {
    return {
      isError: true,
      content: [{ type: "text", text: error.message }],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: "Operation failed" }],
  };
}

export function jsonContent(value: unknown) {
  return [{ type: "text" as const, text: JSON.stringify(value, null, 2) }];
}
