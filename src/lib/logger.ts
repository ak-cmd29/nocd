export type LogStep = "API" | "STT" | "EVAL" | "DB";
type LogLevel = "info" | "warn" | "error";
type LogData = Record<string, unknown>;

export interface SerializedError {
  name: string;
  message: string;
  status?: number;
  stack?: string;
  cause?: SerializedError | string;
}

export function serializeError(error: unknown): SerializedError | string {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? error : JSON.stringify(error) ?? String(error);
  }
  const status = (error as { status?: unknown }).status;
  return {
    name: error.name,
    message: error.message,
    ...(typeof status === "number" ? { status } : {}),
    ...(error.stack ? { stack: error.stack } : {}),
    ...(error.cause !== undefined ? { cause: serializeError(error.cause) } : {}),
  };
}

function write(level: LogLevel, step: LogStep, message: string, attemptId: string | null, data?: LogData): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    step: `[${step}]`,
    attemptId,
    message,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  info: (step: LogStep, message: string, data?: LogData) => void;
  warn: (step: LogStep, message: string, data?: LogData) => void;
  error: (step: LogStep, message: string, error: unknown, data?: LogData) => void;
}

export function createLogger(context: { attemptId: string | null }): Logger {
  return {
    info: (step, message, data) => write("info", step, message, context.attemptId, data),
    warn: (step, message, data) => write("warn", step, message, context.attemptId, data),
    error: (step, message, error, data) =>
      write("error", step, message, context.attemptId, { ...data, error: serializeError(error) }),
  };
}
