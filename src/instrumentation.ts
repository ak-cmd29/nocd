import { LangfuseSpanProcessor } from "@langfuse/otel";
import { setLangfuseTracerProvider } from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export let langfuseSpanProcessor: LangfuseSpanProcessor | null = null;

export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return;

  langfuseSpanProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl:
      process.env.LANGFUSE_BASEURL ??
      process.env.LANGFUSE_BASE_URL ??
      "https://cloud.langfuse.com",
    exportMode: "immediate",
  });

  const provider = new NodeTracerProvider({
    spanProcessors: [langfuseSpanProcessor],
  });

  // Keep Langfuse isolated from any OpenTelemetry provider Next.js or the host
  // may already have registered while retaining async parent/child context.
  setLangfuseTracerProvider(provider);
  provider.register();
}
