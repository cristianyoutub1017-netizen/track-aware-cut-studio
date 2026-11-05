export type TrackNo = 1 | 2 | 3 | 4;

export interface Segment {
  id: string;
  start: number; // segundos en el vídeo original
  end: number;
}

export interface ZoomPlan {
  segmentId: string;
  enabled: boolean;
  from: number;
  to: number;
  cx: number; // 0..1
  cy: number;
  who: "wide" | "me" | "other";
}

export interface Word {
  text: string;
  start: number;
  end: number;
  track: TrackNo;
  db: number;
}

export interface Subtitle {
  id: string;
  start: number; // tiempo original
  end: number;
  text: string;
  track: TrackNo;
  templateId: string;
  shout: boolean;
  punch: boolean; // acercar cámara mientras dura
}

export interface Sfx {
  id: string;
  at: number; // tiempo original
  name: string;
  path: string; // ruta de Windows al archivo de sonido
}

export interface ColorGrade {
  enabled: boolean;
  brightness: number; // -1..1
  contrast: number; // -1..1
  saturation: number; // 0..2 (1 = sin cambio)
  temperature: number; // -1 (frío) .. 1 (cálido)
  look: string;
}

export type Animation = "none" | "pop" | "slide-rl" | "grow" | "shake" | "shake-grow" | "bounce";

export interface SubTemplate {
  id: string;
  name: string;
  font: string;
  size: number; // % de la altura del vídeo
  useTrackColor: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number; // px a 1080p
  position: "bottom" | "center" | "top";
  animation: Animation;
  uppercase: boolean;
  builtIn?: boolean;
}

export type GroupSize = 1 | 2 | 3 | "auto";

export interface GroupOverride {
  id: string;
  start: number;
  end: number;
  size: 1 | 2 | 3;
}

export interface Settings {
  minSilence: number;
  padBefore: number;
  padAfter: number;
  minClip: number;
  thresholdDb: number;
  useGameVoice: boolean;
  zoomEnabled: boolean;
  zoomOnlyDialogue: boolean;
  zoomStart: number;
  zoomEnd: number;
  zoomDirection: "out" | "in" | "combined";
  dialogueGap: number;
  subsEnabled: boolean;
  groupSize: GroupSize;
  trackColors: Record<TrackNo, string>;
  trackEnabled: Record<TrackNo, boolean>;
  defaultTemplate: string;
  shoutTemplate: string;
  shoutDb: number;
  shoutPunch: boolean;
  autoTemplate: boolean;
  colorAuto: boolean;
  sfxAuto: boolean;
  sfxShoutName: string;
  sfxShoutPath: string;
}

export interface AnalysisFile {
  version: number;
  video?: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  audioCount: number;
  win: number;
  levels: Record<string, number[]>;
  /** Nombre de cada pista tal como viene en la grabación (p. ej. títulos de OBS). */
  trackNames?: Record<string, string>;
  /** Ruta del .wav separado de cada pista. */
  trackFiles?: Record<string, string>;
  words: Word[];
}
