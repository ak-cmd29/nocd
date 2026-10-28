"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "requesting" | "recording";

export interface RecordingResult {
  blob: Blob;
  durationMs: number;
}

interface UseAudioRecorderOptions {
  maxDurationMs: number;
  minDurationMs: number;
  onComplete: (result: RecordingResult) => void;
}

export interface AudioRecorder {
  status: RecorderStatus;
  elapsedMs: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"] as const;
const TIMER_INTERVAL_MS = 250;

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function describeMediaError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Microphone access was blocked. Allow microphone access for this site in your browser settings, then try again.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "No microphone was found. Connect a microphone and try again.";
      case "NotReadableError":
      case "AbortError":
        return "Your microphone is being used by another application. Close it and try again.";
    }
  }
  return "Could not start the microphone. Refresh the page and try again.";
}

export function useAudioRecorder({ maxDurationMs, minDurationMs, onComplete }: UseAudioRecorderOptions): AudioRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const mountedRef = useRef(true);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const releaseResources = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      releaseResources();
    };
  }, [releaseResources]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current || status !== "idle") return;
    setError(null);

    const mimeType = pickSupportedMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record audio. Use the latest version of Chrome, Edge, Firefox, or Safari.");
      return;
    }
    const blobType = mimeType.split(";")[0];

    setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (mediaError) {
      if (mountedRef.current) {
        setStatus("idle");
        setError(describeMediaError(mediaError));
      }
      return;
    }

    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
    const chunks: Blob[] = [];
    const startedAt = performance.now();
    discardRef.current = false;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onerror = () => {
      discardRef.current = true;
      if (mountedRef.current) setError("Recording failed unexpectedly. Please try again.");
      if (recorder.state !== "inactive") recorder.stop();
    };

    recorder.onstop = () => {
      const durationMs = performance.now() - startedAt;
      releaseResources();
      if (!mountedRef.current) return;

      setStatus("idle");
      setElapsedMs(0);
      if (discardRef.current) {
        discardRef.current = false;
        return;
      }

      const blob = new Blob(chunks, { type: blobType });
      if (blob.size === 0 || durationMs < minDurationMs) {
        setError(`That recording was too short. Answers must be at least ${Math.ceil(minDurationMs / 1000)} seconds.`);
        return;
      }
      onCompleteRef.current({ blob, durationMs });
    };

    recorderRef.current = recorder;
    streamRef.current = stream;
    recorder.start(1000);
    setElapsedMs(0);
    setStatus("recording");

    timerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= maxDurationMs && recorder.state === "recording") {
        recorder.stop();
      }
    }, TIMER_INTERVAL_MS);
  }, [maxDurationMs, minDurationMs, releaseResources, status]);

  return { status, elapsedMs, error, start, stop };
}
