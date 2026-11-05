import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildTurns, computeKeepSegments, followPath, planZoom, uid, voiceRanges } from "./core";
import { usePlayer } from "./player";
import { NEUTRAL_GRADE } from "./media";
import { BUILT_IN_TEMPLATES, DEFAULT_TRACK_COLORS, DEFAULT_TRACK_ENABLED, buildSubtitles } from "./subtitles";
import type { Preset, Word, AnalysisFile, ColorGrade, GroupOverride, Segment, Settings, Sfx, Subtitle, SubTemplate, ZoomPlan } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  minSilence: 1.2,
  padBefore: 0.3,
  padAfter: 0.8,
  minClip: 0.4,
  thresholdDb: -38,
  useGameVoice: true,
  zoomEnabled: true,
  zoomOnlyDialogue: true,
  zoomStart: 1.35,
  zoomEnd: 1.15,
  zoomDirection: "out",
  dialogueGap: 4,
  subsEnabled: true,
  groupSize: "auto",
  trackColors: DEFAULT_TRACK_COLORS,
  trackEnabled: DEFAULT_TRACK_ENABLED,
  defaultTemplate: "clasico",
  shoutTemplate: "grito",
  shoutDb: -12,
  shoutPunch: true,
  autoTemplate: true,
  colorAuto: true,
  sfxAuto: false,
  sfxShoutName: "Impacto",
  sfxShoutPath: "",
};

export type Selection = { kind: "segment" | "subtitle" | "sfx"; id: string } | null;

interface Snapshot {
  segments: Segment[];
  zooms: ZoomPlan[];
  subtitles: Subtitle[];
  sfx: Sfx[];
}

interface State extends Snapshot {
  settings: Settings;
  templates: SubTemplate[];
  overrides: GroupOverride[];
  color: ColorGrade;
  analysis: AnalysisFile | null;
  videoUrl: string | null;
  videoName: string;
  videoPath: string;
  width: number;
  height: number;
  duration: number;
  selection: Selection;
  past: Snapshot[];
  presets: Preset[];
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  setWords: (w: Word[]) => void;
  setSettings: (p: Partial<Settings>) => void;
  setVideo: (url: string, name: string, meta: { duration: number; width: number; height: number }) => void;
  setVideoPath: (p: string) => void;
  setAnalysis: (a: AnalysisFile | null) => void;
  setColor: (c: Partial<ColorGrade>) => void;
  runAuto: () => void;
  rebuildSubtitles: () => void;
  select: (s: Selection) => void;
  commit: (fn: (s: Snapshot) => Partial<Snapshot>) => void;
  undo: () => void;
  saveTemplate: (t: SubTemplate) => void;
  deleteTemplate: (id: string) => void;
  setOverrides: (o: GroupOverride[]) => void;
}

const snap = (s: Snapshot): Snapshot => ({ segments: s.segments, zooms: s.zooms, subtitles: s.subtitles, sfx: s.sfx });

export const useEditor = create<State>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      templates: BUILT_IN_TEMPLATES,
      overrides: [],
      color: NEUTRAL_GRADE,
      analysis: null,
      videoUrl: null,
      videoName: "",
      videoPath: "",
      width: 3840,
      height: 2160,
      duration: 0,
      segments: [],
      zooms: [],
      subtitles: [],
      sfx: [],
      selection: null,
      past: [],
      presets: [],
      savePreset: (name) =>
        set((s) => ({ presets: [...s.presets.filter((p) => p.name !== name), { id: uid(), name, settings: s.settings, color: s.color, muted: usePlayer.getState().muted }] })),
      loadPreset: (id) => {
        const p = get().presets.find((x) => x.id === id);
        if (!p) return;
        set({ settings: { ...DEFAULT_SETTINGS, ...p.settings }, color: p.color });
        usePlayer.getState().setMuted(p.muted);
      },
      deletePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
      setWords: (words) => {
        const a = get().analysis;
        if (!a) return;
        set({ analysis: { ...a, words } });
        get().rebuildSubtitles();
      },
      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      setVideo: (url, name, meta) =>
        set((s) => ({
          videoUrl: url,
          videoName: name,
          videoPath: s.videoPath && s.videoPath.endsWith(name) ? s.videoPath : `C:\\Grabaciones\\${name}`,
          ...meta,
        })),
      setVideoPath: (p) => set({ videoPath: p }),
      setAnalysis: (a) => set(a ? { analysis: a, duration: a.duration || get().duration, width: a.width || get().width, height: a.height || get().height } : { analysis: null }),
      setColor: (c) => set((s) => ({ color: { ...s.color, ...c } })),
      runAuto: () => {
        const { analysis: a, settings: c, duration } = get();
        if (!a) return;
        const r = (k: number) => (a.levels[String(k)] ? voiceRanges(a.levels[String(k)]!, a.win, c.thresholdDb) : []);
        const me = r(1);
        const other = [...r(3), ...(c.useGameVoice ? r(2) : [])];
        const segments = computeKeepSegments([...me, ...other], a.duration || duration, c);
        const zooms = planZoom(segments, buildTurns(me, other), c).map((z) => {
          const seg = segments.find((x) => x.id === z.segmentId)!;
          return z.enabled ? { ...z, follow: followPath(seg, me, other, z) } : z;
        });
        const subtitles = c.subsEnabled ? buildSubtitles(a.words, segments, c, get().overrides) : [];
        const sfx: Sfx[] = c.sfxAuto
          ? subtitles.filter((s) => s.shout).map((s) => ({ id: uid(), at: s.start, name: c.sfxShoutName, path: c.sfxShoutPath }))
          : [];
        set((s) => ({ past: [...s.past.slice(-40), snap(s)], segments, zooms, subtitles, sfx, selection: null }));
      },
      rebuildSubtitles: () => {
        const { analysis: a, settings: c, segments, overrides } = get();
        if (!a) return;
        set((s) => ({ past: [...s.past.slice(-40), snap(s)], subtitles: buildSubtitles(a.words, segments, c, overrides) }));
      },
      select: (selection) => set({ selection }),
      commit: (fn) => set((s) => ({ past: [...s.past.slice(-40), snap(s)], ...fn(snap(s)) })),
      undo: () =>
        set((s) => {
          const prev = s.past[s.past.length - 1];
          return prev ? { ...prev, past: s.past.slice(0, -1) } : {};
        }),
      saveTemplate: (t) =>
        set((s) => ({ templates: s.templates.some((x) => x.id === t.id) ? s.templates.map((x) => (x.id === t.id ? t : x)) : [...s.templates, t] })),
      deleteTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id || t.builtIn) })),
      setOverrides: (overrides) => set({ overrides }),
    }),
    {
      name: "autocut-editor",
      skipHydration: true,
      version: 1,
      partialize: (s) => ({
        settings: s.settings,
        templates: s.templates,
        overrides: s.overrides,
        color: s.color,
        videoPath: s.videoPath,
        videoName: s.videoName,
        width: s.width,
        height: s.height,
        duration: s.duration,
        segments: s.segments,
        zooms: s.zooms,
        subtitles: s.subtitles,
        sfx: s.sfx,
        analysis: s.analysis,
        presets: s.presets,
      }),
    },
  ),
);
