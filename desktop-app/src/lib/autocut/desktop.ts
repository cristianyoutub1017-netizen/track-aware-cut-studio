import type { AnalysisFile } from "./types";

// Puente con el programa de escritorio (Electron). En el navegador no existe.
export interface AnalyzeResult {
  analysis: AnalysisFile;
  folder: string; // carpeta con las pistas separadas (.wav)
  warning?: string;
}

export interface DesktopApi {
  pickVideo: () => Promise<{ path: string; url: string; name: string } | null>;
  probe: (path: string) => Promise<{ duration: number; width: number; height: number; fps: number; audioCount: number }>;
  /** Detecta y separa las pistas de audio, mide volúmenes y transcribe. Todo automático. */
  analyze: (path: string) => Promise<AnalyzeResult>;
  onProgress: (cb: (p: { step: string; pct: number }) => void) => () => void;
  openFolder: (path: string) => Promise<string>;
  saveText: (defaultPath: string, content: string) => Promise<string | null>;
}

export const desktop = (): DesktopApi | null =>
  typeof window !== "undefined" ? ((window as unknown as { autocut?: DesktopApi }).autocut ?? null) : null;
