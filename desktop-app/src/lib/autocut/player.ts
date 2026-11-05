import { create } from "zustand";
import { cropRect } from "./core";
import type { Segment, Subtitle, TrackNo, ZoomPlan } from "./types";

interface Player {
  time: number; // tiempo original
  playing: boolean;
  video: HTMLVideoElement | null;
  /** Tiempo bajo el ratón en la línea de tiempo (para dividir con S). */
  hoverTime: number | null;
  muted: Record<TrackNo, boolean>;
  setVideo: (v: HTMLVideoElement | null) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setHoverTime: (t: number | null) => void;
  toggleMute: (t: TrackNo) => void;
  setMuted: (m: Record<TrackNo, boolean>) => void;
  seek: (t: number) => void;
}

export const DEFAULT_MUTED: Record<TrackNo, boolean> = { 1: false, 2: false, 3: false, 4: true };

export const usePlayer = create<Player>((set, get) => ({
  time: 0,
  playing: false,
  video: null,
  hoverTime: null,
  muted: DEFAULT_MUTED,
  setVideo: (video) => set({ video }),
  setTime: (time) => set({ time }),
  setPlaying: (playing) => set({ playing }),
  setHoverTime: (hoverTime) => set({ hoverTime }),
  toggleMute: (t) => set((s) => ({ muted: { ...s.muted, [t]: !s.muted[t] } })),
  setMuted: (muted) => set({ muted }),
  seek: (t) => {
    const v = get().video;
    if (v) v.currentTime = t;
    set({ time: t });
  },
}));

const smooth = (p: number) => p * p * (3 - 2 * p);

/** Centro del encuadre en el instante rel (segundos desde el inicio del clip), interpolando los puntos de cada segundo. */
export function focusAt(z: ZoomPlan, rel: number): [number, number] {
  const f = z.follow;
  if (!f || !f.length || z.manual) return [z.cx, z.cy];
  if (rel <= f[0]!.t) return [f[0]!.cx, f[0]!.cy];
  for (let i = 1; i < f.length; i++) {
    const a = f[i - 1]!, b = f[i]!;
    if (rel <= b.t) {
      const p = smooth((rel - a.t) / Math.max(0.001, b.t - a.t));
      return [a.cx + (b.cx - a.cx) * p, a.cy + (b.cy - a.cy) * p];
    }
  }
  const l = f[f.length - 1]!;
  return [l.cx, l.cy];
}

export function zoomAt(z: ZoomPlan | undefined, seg: Segment, rel: number) {
  if (!z?.enabled) return 1;
  return z.from + (z.to - z.from) * smooth(Math.min(1, Math.max(0, rel / Math.max(0.01, seg.end - seg.start))));
}

export function viewAt(t: number, segments: Segment[], zooms: ZoomPlan[], subs: Subtitle[], W: number, H: number) {
  const seg = segments.find((s) => t >= s.start && t <= s.end);
  const z = seg && zooms.find((x) => x.segmentId === seg.id);
  const rel = seg ? t - seg.start : 0;
  let zoom = seg ? zoomAt(z, seg, rel) : 1;
  if (subs.some((s) => s.punch && t >= s.start && t <= s.end)) zoom *= 1.3;
  const [cx, cy] = z?.enabled ? focusAt(z, rel) : [0.5, 0.5];
  const [x = 0, y = 0] = cropRect(cx, cy, zoom, W, H);
  return { zoom, tx: (x / W) * 100, ty: (y / H) * 100 };
}
