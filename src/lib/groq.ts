import Groq, { toFile } from "groq-sdk";
import { RECORDING_FORMATS, recordingExtensionForPath } from "@/lib/assessment/recordings";

export const TRANSCRIPTION_MODEL = "whisper-large-v3";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export class TranscriptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TranscriptionError";
  }
}

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new TranscriptionError("Missing GROQ_API_KEY environment variable.");
    }
    groqClient = new Groq({ apiKey, maxRetries: 2, timeout: 60_000 });
  }
  return groqClient;
}

function describeGroqError(error: unknown): string {
  if (error instanceof Groq.APIError) {
    switch (error.status) {
      case 401:
      case 403:
        return "Groq rejected the API key.";
      case 413:
        return "The recording is too large for Groq to transcribe.";
      case 429:
        return "Groq rate limit reached. Wait a moment and try again.";
      default:
        return `Groq returned an error${error.status ? ` (HTTP ${error.status})` : ""}: ${error.message}`;
    }
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "Timed out waiting for Groq to transcribe the recording.";
  }
  return error instanceof Error ? error.message : "Unknown transcription error.";
}

function cleanTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function downloadAudio(audioUrl: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(audioUrl, { cache: "no-store", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (error) {
    throw new TranscriptionError("Could not download the recording from storage.", { cause: error });
  }
  if (!response.ok) {
    throw new TranscriptionError(`Could not download the recording from storage (HTTP ${response.status}).`);
  }

  const declaredBytes = Number(response.headers.get("content-length") ?? "0");
  if (declaredBytes > MAX_AUDIO_BYTES) {
    throw new TranscriptionError("The recording exceeds the 25 MB transcription limit.");
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.byteLength === 0) {
    throw new TranscriptionError("The recording is empty.");
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new TranscriptionError("The recording exceeds the 25 MB transcription limit.");
  }
  return audio;
}

export async function transcribeAudioUrl(audioUrl: string): Promise<string> {
  const extension = recordingExtensionForPath(new URL(audioUrl).pathname);
  if (!extension) {
    throw new TranscriptionError("The recording is not in a supported format (WebM or MP4).");
  }
  const audio = await downloadAudio(audioUrl);
  const file = await toFile(audio, `answer.${extension}`, { type: RECORDING_FORMATS[extension] });

  try {
    const transcription = await getGroqClient().audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
      language: "en",
      response_format: "json",
      temperature: 0,
    });
    return cleanTranscript(transcription.text);
  } catch (error) {
    if (error instanceof TranscriptionError) throw error;
    throw new TranscriptionError(describeGroqError(error), { cause: error });
  }
}
