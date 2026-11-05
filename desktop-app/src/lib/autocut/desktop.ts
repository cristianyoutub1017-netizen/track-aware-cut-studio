import type { AnalysisFile, Word } from "./types";

// Puente con el programa de escritorio (Electron). En el navegador no existe.
export interface AnalyzeResult {
  analysis: AnalysisFile;
  folder: string; // carpeta con las pistas separadas (.wav)
  warning?: string;
  /** Audio ligero (16 kHz) de cada pista para la transcripción. */
  asr: Record<string, string>;
}

export interface DesktopApi {
  pickVideo: () => Promise<{ path: string; url: string; name: string } | null>;
  probe: (path: string) => Promise<{ duration: number; width: number; height: number; fps: number; audioCount: number }>;
  /** Detecta y separa las pistas de audio, mide volúmenes y transcribe. Todo automático. */
  analyze: (path: string) => Promise<AnalyzeResult>;
  /** Genera los subtítulos en segundo plano. */
  transcribe: (asr: Record<string, string>, levels: Record<string, number[]>, tracks: number[]) => Promise<{ words: Word[]; warning?: string }>;
  onProgress: (cb: (p: { step: string; pct: number }) => void) => () => void;
  openFolder: (path: string) => Promise<string>;
  saveText: (defaultPath: string, content: string) => Promise<string | null>;
}

export const desktop = (): DesktopApi | null =>
  typeof window !== "undefined" ? ((window as unknown as { autocut?: DesktopApi }).autocut ?? null) : null;
