// Lógica de cortes y zoom portada de AutoCut GTA v3.1 (core.js).
import type { Segment, Settings, ZoomPlan } from "./types";

export type Range = [number, number];

export const uid = () => Math.random().toString(36).slice(2, 10);

export function voiceRanges(levels: number[], win: number, thresholdDb: number): Range[] {
  const out: Range[] = [];
  let s = -1;
  for (let i = 0; i <= levels.length; i++) {
    const on = i < levels.length && levels[i]! > thresholdDb;
    if (on && s < 0) s = i;
    if (!on && s >= 0) {
      out.push([s * win, i * win]);
      s = -1;
    }
  }
  return out;
}

export function computeKeepSegments(ranges: Range[], duration: number, c: Settings): Segment[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  if (!sorted.length) return [];
  const merged: Range[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < c.minSilence) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const padded = merged.map(([a, b]) => [Math.max(0, a - c.padBefore), Math.min(duration, b + c.padAfter)] as Range);
  const out: Range[] = [];
  for (const r of padded) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out
    .filter(([a, b]) => b - a >= c.minClip)
    .map(([a, b]) => ({ id: uid(), start: +a.toFixed(3), end: +b.toFixed(3) }));
}

export interface Turn {
  start: number;
  end: number;
  who: "me" | "other";
}

export function buildTurns(me: Range[], other: Range[]): Turn[] {
  const t: Turn[] = [
    ...me.map(([start, end]) => ({ start, end, who: "me" as const })),
    ...other.map(([start, end]) => ({ start, end, who: "other" as const })),
  ].sort((a, b) => a.start - b.start);
  const out: Turn[] = [];
  for (const x of t) {
    const l = out[out.length - 1];
    if (l && l.who === x.who && x.start - l.end < 0.6) l.end = Math.max(l.end, x.end);
    else out.push({ ...x });
  }
  return out.filter((x) => x.end - x.start >= 0.35);
}

export function findDialogues(turns: Turn[], gap: number): Range[] {
  const res: Range[] = [];
  let g: Turn[] = [];
  const flush = () => {
    if (!g.length) return;
    const dur = (w: string) => g.filter((x) => x.who === w).reduce((a, x) => a + x.end - x.start, 0);
    let switches = 0;
    for (let i = 1; i < g.length; i++) if (g[i]!.who !== g[i - 1]!.who) switches++;
    if (switches >= 1 && dur("me") >= 0.6 && dur("other") >= 0.6)
      res.push([Math.max(0, g[0]!.start - 0.3), Math.max(...g.map((x) => x.end)) + 0.5]);
    g = [];
  };
  for (const t of turns) {
    const end = g.length ? Math.max(...g.map((x) => x.end)) : -1e9;
    if (g.length && t.start - end > gap) flush();
    g.push(t);
  }
  flush();
  return res;
}

// Plan de zoom por segmento: primer plano en diálogos, plano general el resto.
export function planZoom(segments: Segment[], turns: Turn[], c: Settings): ZoomPlan[] {
  const dialogues = c.zoomOnlyDialogue ? findDialogues(turns, c.dialogueGap) : null;
  let n = 0;
  return segments.map((s) => {
    const mid = (s.start + s.end) / 2;
    const inDlg = dialogues ? dialogues.some(([a, b]) => s.end > a && s.start < b) : true;
    const turn = turns.find((t) => mid >= t.start && mid <= t.end);
    const who: ZoomPlan["who"] = !inDlg ? "wide" : turn?.who === "other" ? "other" : "me";
    const near = Math.max(c.zoomStart, c.zoomEnd);
    const far = Math.min(c.zoomStart, c.zoomEnd);
    const inward = c.zoomDirection === "in" || (c.zoomDirection === "combined" && n % 2 === 1);
    if (who !== "wide") n++;
    return {
      segmentId: s.id,
      enabled: c.zoomEnabled && who !== "wide",
      from: inward ? far : near,
      to: inward ? near : far,
      cx: who === "other" ? 0.6 : 0.5,
      cy: 0.55,
      who,
    };
  });
}

// Mapear tiempo original -> tiempo en la línea editada (null si cae en un corte).
export function sourceToTimeline(t: number, segments: Segment[]): number | null {
  let pos = 0;
  for (const s of segments) {
    if (t >= s.start && t <= s.end) return +(pos + t - s.start).toFixed(4);
    pos += s.end - s.start;
  }
  return null;
}

export function timelineToSource(p: number, segments: Segment[]): number {
  let pos = 0;
  for (const s of segments) {
    const len = s.end - s.start;
    if (p <= pos + len) return s.start + (p - pos);
    pos += len;
  }
  return segments[segments.length - 1]?.end ?? 0;
}

export const editedDuration = (segments: Segment[]) => segments.reduce((a, s) => a + s.end - s.start, 0);

// Rectángulo de pan/crop en píxeles para un centro y zoom.
export function cropRect(cx: number, cy: number, zoom: number, W: number, H: number) {
  const w = W / zoom;
  const h = H / zoom;
  const x = Math.min(W - w, Math.max(0, cx * W - w / 2));
  const y = Math.min(H - h, Math.max(0, cy * H - h / 2));
  return [+x.toFixed(1), +y.toFixed(1), +w.toFixed(1), +h.toFixed(1)];
}

export const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
};

/**
 * Seguimiento del encuadre cada segundo: en cada segundo del clip mira quién habla
 * (tú = centro, otro = algo a la derecha) y suaviza el movimiento entre puntos.
 */
export function followPath(seg: Segment, me: Range[], other: Range[], base: { cx: number; cy: number }) {
  const talking = (rs: Range[], a: number, b: number) => rs.reduce((acc, [x, y]) => acc + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  const len = seg.end - seg.start;
  const pts: { t: number; cx: number; cy: number }[] = [];
  let prev = base.cx;
  for (let t = 0; t <= len + 1e-6; t += 1) {
    const a = seg.start + t - 0.5, b = seg.start + t + 0.5;
    const m = talking(me, a, b), o = talking(other, a, b);
    const target = o > m + 0.05 ? 0.6 : m > o + 0.05 ? 0.5 : prev;
    prev = prev + (target - prev) * 0.6;
    pts.push({ t: +Math.min(t, len).toFixed(3), cx: +prev.toFixed(4), cy: base.cy });
  }
  if (pts.length && pts[pts.length - 1]!.t < len - 0.05) pts.push({ t: +len.toFixed(3), cx: prev, cy: base.cy });
  return pts;
}
