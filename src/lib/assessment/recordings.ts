export const RECORDINGS_BUCKET = "recordings";

export const RECORDING_FORMATS = {
  webm: "audio/webm",
  mp4: "audio/mp4",
} as const;

export type RecordingExtension = keyof typeof RECORDING_FORMATS;

export const RECORDING_EXTENSIONS = Object.keys(RECORDING_FORMATS) as RecordingExtension[];

export function recordingExtensionForMimeType(mimeType: string): RecordingExtension | null {
  const baseType = mimeType.split(";")[0].trim().toLowerCase();
  return RECORDING_EXTENSIONS.find((extension) => RECORDING_FORMATS[extension] === baseType) ?? null;
}

export function recordingExtensionForPath(path: string): RecordingExtension | null {
  const extension = path.split(".").pop()?.toLowerCase();
  return RECORDING_EXTENSIONS.find((candidate) => candidate === extension) ?? null;
}

export function recordingPath(attemptId: string, questionIndex: number, extension: RecordingExtension): string {
  return `attempts/${attemptId}/q${questionIndex + 1}.${extension}`;
}
