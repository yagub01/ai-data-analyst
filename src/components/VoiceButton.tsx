"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib).
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Dictation in the browser (Chrome, Edge, Safari). Calls onText with the
 * transcript so far while the user speaks, and onFinal when they stop.
 */
export function VoiceButton({
  onStart,
  onText,
  onFinal,
  size = "md",
}: {
  onStart?: () => void;
  onText: (text: string) => void;
  onFinal?: (text: string) => void;
  size?: "sm" | "md";
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Assume support during server render; the browser answers after hydration.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognition() !== null,
    () => true,
  );
  const recRef = useRef<Recognition | null>(null);
  const textRef = useRef("");

  useEffect(() => () => recRef.current?.stop(), []);

  function start() {
    const Ctor = getRecognition();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      textRef.current = (finalText + interim).trim();
      onText(textRef.current);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setError("Microphone access was blocked.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError("Voice input stopped.");
    };
    rec.onend = () => {
      setListening(false);
      if (textRef.current) onFinal?.(textRef.current);
    };
    textRef.current = "";
    recRef.current = rec;
    onStart?.();
    rec.start();
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
  }

  if (!supported) {
    return (
      <span className="text-xs text-muted" title="Voice input works in Chrome, Edge and Safari.">
        Voice not supported in this browser
      </span>
    );
  }

  const dim = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-label={listening ? "Stop recording" : "Speak instead of typing"}
        title={listening ? "Stop recording" : "Speak instead of typing"}
        className={`${dim} shrink-0 inline-flex items-center justify-center rounded-full border transition ${
          listening
            ? "bg-bad text-white border-transparent animate-pulse"
            : "border-line bg-surface text-ink-2 hover:text-ink hover:bg-surface-2"
        }`}
      >
        {listening ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}
      </button>
      {listening && <span className="text-xs text-ink-2">Listening…</span>}
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}
