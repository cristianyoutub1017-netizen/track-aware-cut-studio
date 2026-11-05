import { create } from "zustand";
import { cropRect } from "./core";
import type { Segment, Subtitle, ZoomPlan } from "./types";

interface Player {
  time: number; // tiempo original
  playing: boolean;
  video: HTMLVideoElement | null;
  setVideo: (v: HTMLVideoElement | null) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  seek: (t: number) => void;
}

export const usePlayer = create<Player>((set, get) => ({
  time: 0,
  playing: false,
  video: null,
  setVideo: (video) => set({ video }),
  setTime: (time) => set({ time }),
  setPlaying: (playing) => set({ playing }),
  seek: (t) => {
    const v = get().video;
    if (v) v.currentTime = t;
    set({ time: t });
  },
}));

const smooth = (p: number) => p * p * (3 - 2 * p);

export function viewAt(t: number, segments: Segment[], zooms: ZoomPlan[], subs: Subtitle[], W: number, H: number) {
  const seg = segments.find((s) => t >= s.start && t <= s.end);
  const z = seg && zooms.find((x) => x.segmentId === seg.id);
  let zoom = 1;
  if (seg && z?.enabled) zoom = z.from + (z.to - z.from) * smooth((t - seg.start) / Math.max(0.01, seg.end - seg.start));
  if (subs.some((s) => s.punch && t >= s.start && t <= s.end)) zoom *= 1.3;
  const [x = 0, y = 0] = cropRect(z?.enabled ? z.cx : 0.5, z?.enabled ? z.cy : 0.5, zoom, W, H);
  return { zoom, tx: (x / W) * 100, ty: (y / H) * 100 };
}
