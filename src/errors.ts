export class TailscaleError extends Error {
  code?: string;
  statusCode?: number;

  constructor(
    message: string,
    options?: { code?: string; statusCode?: number },
  ) {
    super(message);
    this.name = "TailscaleError";
    this.code = options?.code;
    this.statusCode = options?.statusCode;
  }
}

export class CLIError extends Error {
  stderr?: string;
  exitCode?: number;

  constructor(
    message: string,
    options?: { stderr?: string; exitCode?: number },
  ) {
    super(message);
    this.name = "CLIError";
    this.stderr = options?.stderr;
    this.exitCode = options?.exitCode;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Prefer response.data.error when present (e.g. Axios-shaped errors)
    const asObj = error as unknown as Record<string, unknown>;
    const responseData = asObj.response;
    if (
      typeof responseData === "object" &&
      responseData !== null &&
      "data" in responseData
    ) {
      const data = (responseData as Record<string, unknown>).data;
      if (
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as Record<string, unknown>).error === "string"
      ) {
        return (data as Record<string, unknown>).error as string;
      }
    }
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  ) {
    return (error as Record<string, unknown>).message as string;
  }
  return String(error);
}
