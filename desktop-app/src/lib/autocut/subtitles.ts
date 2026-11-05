import { uid } from "./core";
import type { GroupOverride, GroupSize, Segment, Settings, Subtitle, SubTemplate, TrackNo, Word } from "./types";

export const DEFAULT_TRACK_COLORS: Record<TrackNo, string> = {
  1: "#ffffff", // micrófono
  2: "#ffd400", // juego
  3: "#ff2020", // discord
  4: "#ff8c00", // pista 4
};
export const DEFAULT_TRACK_ENABLED: Record<TrackNo, boolean> = { 1: true, 2: true, 3: true, 4: false };
export const TRACK_NAMES: Record<TrackNo, string> = { 1: "Micrófono", 2: "Juego", 3: "Discord", 4: "Pista 4" };

export const BUILT_IN_TEMPLATES: SubTemplate[] = [
  { id: "clasico", name: "Clásico abajo", font: "Impact", size: 7, useTrackColor: true, fill: "#ffffff", stroke: "#000000", strokeWidth: 8, position: "bottom", animation: "pop", uppercase: true, builtIn: true },
  { id: "deslizar", name: "Deslizar derecha → izquierda", font: "Impact", size: 7, useTrackColor: true, fill: "#ffffff", stroke: "#000000", strokeWidth: 8, position: "bottom", animation: "slide-rl", uppercase: true, builtIn: true },
  { id: "crecer", name: "Crecer", font: "Impact", size: 8, useTrackColor: true, fill: "#ffffff", stroke: "#000000", strokeWidth: 9, position: "bottom", animation: "grow", uppercase: true, builtIn: true },
  { id: "grito", name: "GRITO (centro, vibra y crece)", font: "Impact", size: 15, useTrackColor: true, fill: "#ffffff", stroke: "#000000", strokeWidth: 14, position: "center", animation: "shake-grow", uppercase: true, builtIn: true },
  { id: "rebote", name: "Rebote", font: "Impact", size: 8, useTrackColor: true, fill: "#ffffff", stroke: "#000000", strokeWidth: 8, position: "bottom", animation: "bounce", uppercase: true, builtIn: true },
  { id: "vibrar", name: "Vibrar", font: "Impact", size: 9, useTrackColor: true, fill: "#ffffff", stroke: "#000000", strokeWidth: 10, position: "center", animation: "shake", uppercase: true, builtIn: true },
];

const PUNCT = /[.,!?¡¿;:…]$/;

function sizeAt(t: number, global: GroupSize, overrides: GroupOverride[]): GroupSize {
  const o = overrides.find((x) => t >= x.start && t < x.end);
  return o ? o.size : global;
}

// Agrupa las palabras de una pista en subtítulos de 1, 2, 3 palabras o dinámico.
export function chunkWords(words: Word[], global: GroupSize, overrides: GroupOverride[], shoutDb: number): Word[][] {
  const out: Word[][] = [];
  let cur: Word[] = [];
  const sorted = [...words].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const w = sorted[i]!;
    const size = sizeAt(w.start, global, overrides);
    const prev = cur[cur.length - 1];
    const gap = prev ? w.start - prev.end : 0;
    const shout = w.db >= shoutDb;
    const limit = size === "auto" ? 3 : size;
    const breakBefore =
      cur.length >= limit ||
      (prev && size === "auto" && (gap > 0.35 || PUNCT.test(prev.text) || (prev.db >= shoutDb) !== shout)) ||
      (prev && gap > 1);
    if (breakBefore && cur.length) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function buildSubtitles(words: Word[], segments: Segment[], s: Settings, overrides: GroupOverride[]): Subtitle[] {
  const res: Subtitle[] = [];
  for (const track of [1, 2, 3, 4] as TrackNo[]) {
    if (!s.trackEnabled[track]) continue;
    const tw = words.filter((w) => w.track === track && segments.some((g) => w.start < g.end && w.end > g.start));
    for (const group of chunkWords(tw, s.groupSize, overrides, s.shoutDb)) {
      const shout = group.some((w) => w.db >= s.shoutDb);
      const first = group[0]!;
      const start = first.start;
      // mantener dentro del segmento donde empieza
      const seg = segments.find((g) => start >= g.start && start < g.end) ?? segments.find((g) => first.end > g.start);
      if (!seg) continue;
      const a = Math.max(start, seg.start);
      const b = Math.min(group[group.length - 1]!.end, seg.end);
      if (b - a < 0.05) continue;
      res.push({
        id: uid(),
        start: +a.toFixed(3),
        end: +b.toFixed(3),
        text: group.map((w) => w.text).join(" "),
        track,
        templateId: s.autoTemplate && shout ? s.shoutTemplate : s.defaultTemplate,
        shout,
        punch: shout && s.shoutPunch,
      });
    }
  }
  return res.sort((a, b) => a.start - b.start);
}
