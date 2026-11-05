import { cropRect, sourceToTimeline } from "./core";
import type { ColorGrade, Segment, Settings, Sfx, Subtitle, SubTemplate, TrackNo, ZoomPlan } from "./types";
import { TRACK_NAMES } from "./subtitles";

export interface ExportInput {
  videoPath: string;
  width: number;
  height: number;
  audioCount: number;
  segments: Segment[];
  zooms: ZoomPlan[];
  subtitles: Subtitle[];
  templates: SubTemplate[];
  sfx: Sfx[];
  color: ColorGrade;
  settings: Settings;
}

const smooth = (p: number) => p * p * (3 - 2 * p);
const n3 = (x: number) => +x.toFixed(3);

// Keyframes [t, x, y, w, h] relativos al evento, para cada segmento.
export function cameraKeyframes(seg: Segment, z: ZoomPlan | undefined, subs: Subtitle[], W: number, H: number): number[] {
  const len = seg.end - seg.start;
  const base = (t: number) => (z && z.enabled ? z.from + (z.to - z.from) * smooth(Math.min(1, Math.max(0, t / len))) : 1);
  const cx = z?.enabled ? z.cx : 0.5;
  const cy = z?.enabled ? z.cy : 0.5;
  const pts = new Map<number, number>();
  pts.set(0, base(0));
  if (z?.enabled) {
    pts.set(n3(len / 2), base(len / 2));
    pts.set(n3(len), base(len));
  }
  for (const s of subs) {
    if (!s.punch || s.start < seg.start || s.start >= seg.end) continue;
    const a = s.start - seg.start;
    const b = Math.min(len, s.end - seg.start);
    if (a > 0.06) pts.set(n3(a - 0.05), base(a - 0.05));
    pts.set(n3(a + 0.08), base(a) * 1.3);
    pts.set(n3(b), base(b) * 1.3);
    if (b + 0.15 < len) pts.set(n3(b + 0.15), base(b + 0.15));
  }
  return [...pts.entries()]
    .sort((x, y) => x[0] - y[0])
    .flatMap(([t, zoom]) => [t, ...cropRect(cx, cy, zoom, W, H)]);
}

// Animación del subtítulo con keyframes de pan/crop: [t, x, y, w, h]
export function subtitleMotion(t: SubTemplate, len: number, W: number, H: number): number[] {
  const yOff = t.position === "bottom" ? -0.32 * H : t.position === "top" ? 0.32 * H : 0;
  const box = (scale: number, dx = 0, dy = 0) => {
    const w = W / scale, h = H / scale;
    return [n3((W - w) / 2 + dx), n3((H - h) / 2 + yOff + dy), n3(w), n3(h)];
  };
  const k: number[] = [];
  const add = (time: number, b: number[]) => k.push(n3(Math.min(time, len)), ...b);
  switch (t.animation) {
    case "pop": add(0, box(0.6)); add(0.12, box(1.08)); add(0.2, box(1)); break;
    case "grow": add(0, box(0.8)); add(len, box(1.25)); break;
    case "slide-rl": add(0, box(1, -0.6 * W)); add(0.25, box(1)); break;
    case "bounce": add(0, box(1, 0, 0.1 * H)); add(0.1, box(1, 0, -0.03 * H)); add(0.2, box(1)); break;
    case "shake":
    case "shake-grow": {
      const steps = Math.max(2, Math.floor(len / 0.05));
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const sc = t.animation === "shake-grow" ? 0.85 + 0.45 * p : 1;
        const a = 0.012 * W;
        add(p * len, box(sc, i % 2 ? a : -a, i % 3 ? a * 0.6 : -a * 0.6));
      }
      break;
    }
    default: add(0, box(1));
  }
  return k;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

function rtfText(s: string) {
  let o = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "{" || ch === "}") o += "\\" + ch;
    else if (c > 127) o += `\\u${c > 32767 ? c - 65536 : c}?`;
    else o += ch;
  }
  return o;
}

const hex = (h: string) => {
  const v = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0);
};

export function subtitleColor(sub: Subtitle, t: SubTemplate, s: Settings) {
  return t.useTrackColor ? s.trackColors[sub.track] : t.fill;
}

export function vegasScript(x: ExportInput): string {
  const { width: W, height: H, settings: c } = x;
  const tplOf = (id: string) => (x.templates.find((t) => t.id === id) ?? x.templates[0])!;
  const segLines = x.segments.map((s) => `new double[]{${s.start},${s.end}}`).join(",\n      ");
  const camLines = x.segments
    .map((s) => "new double[]{" + cameraKeyframes(s, x.zooms.find((z) => z.segmentId === s.id), x.subtitles, W, H).join(",") + "}")
    .join(",\n      ");

  const subs = x.subtitles
    .map((s) => {
      const pos = sourceToTimeline(s.start, x.segments);
      if (pos == null) return null;
      const t = tplOf(s.templateId);
      const text = t.uppercase ? s.text.toUpperCase() : s.text;
      const [r = 0, g = 0, b = 0] = hex(subtitleColor(s, t, c));
      const [sr = 0, sg = 0, sb = 0] = hex(t.stroke);
      const pt = Math.round((t.size * H) / 100 * 0.75);
      const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 ${t.font};}}{\\colortbl;\\red${r}\\green${g}\\blue${b};}\\qc\\cf1\\f0\\fs${pt * 2} ${rtfText(text)}\\par}`;
      const len = Math.max(0.1, s.end - s.start);
      return `new Sub(${s.track}, ${pos}, ${n3(len)}, "${esc(rtf)}", ${r / 255}, ${g / 255}, ${b / 255}, ${sr / 255}, ${sg / 255}, ${sb / 255}, ${(t.strokeWidth / 100).toFixed(3)}, new double[]{${subtitleMotion(t, len, W, H).join(",")}})`;
    })
    .filter(Boolean)
    .join(",\n      ");

  const sfx = x.sfx
    .map((f) => {
      const pos = sourceToTimeline(f.at, x.segments);
      return pos == null ? null : `new Fx(${pos}, "${esc(f.name)}", "${esc(f.path)}")`;
    })
    .filter(Boolean)
    .join(",\n      ");

  const order = [1, 2, 3, 4].map((n) => n - 1);
  const names = ([1, 2, 3, 4] as TrackNo[]).map((n) => TRACK_NAMES[n]);
  const g = x.color;

  return `// Generado por AutoCut GTA Editor - Vegas Pro 23: Herramientas > Secuencias de comandos > Ejecutar script
// Los tiempos están en segundos exactos del vídeo original.
using System;
using System.IO;
using System.Collections.Generic;
using System.Windows.Forms;
using ScriptPortal.Vegas;

public class EntryPoint {
  class Sub { public int Track; public double Pos, Len; public string Rtf; public double R,G,B,SR,SG,SB,SW; public double[] K;
    public Sub(int tr, double p, double l, string rtf, double r, double g, double b, double sr, double sg, double sb, double sw, double[] k){Track=tr;Pos=p;Len=l;Rtf=rtf;R=r;G=g;B=b;SR=sr;SG=sg;SB=sb;SW=sw;K=k;} }
  class Fx { public double Pos; public string Name, Path; public Fx(double p, string n, string f){Pos=p;Name=n;Path=f;} }

  static string VIDEO = "${esc(x.videoPath)}";
  static double[][] SEGS = new double[][]{
      ${segLines}
  };
  static double[][] CAMS = new double[][]{
      ${camLines}
  };
  static Sub[] SUBS = new Sub[]{
      ${subs}
  };
  static Fx[] SFX = new Fx[]{
      ${sfx}
  };
  static int[] AUDIO_ORDER = new int[]{${order.join(",")}};
  static string[] AUDIO_NAMES = new string[]{"${names.join('","')}"};
  static int AUDIO_COUNT = ${x.audioCount};
  static bool COLOR = ${g.enabled ? "true" : "false"};
  static double BRIGHT = ${g.brightness}, CONTRAST = ${g.contrast}, SAT = ${g.saturation}, TEMP = ${g.temperature};
  static List<string> avisos = new List<string>();

  public void FromVegas(Vegas vegas) {
    Media media = new Media(VIDEO);
    VideoTrack vt = new VideoTrack(0, "Video");
    vegas.Project.Tracks.Add(vt);
    AudioTrack[] ats = new AudioTrack[AUDIO_COUNT];
    for (int i = 0; i < AUDIO_COUNT; i++) {
      ats[i] = new AudioTrack(i + 1, i < AUDIO_NAMES.Length ? AUDIO_NAMES[i] : ("Audio " + (i + 1)));
      vegas.Project.Tracks.Add(ats[i]);
      if (i == 3) ats[i].Mute = true;
    }
    double pos = 0;
    for (int s = 0; s < SEGS.Length; s++) {
      double a = SEGS[s][0], b = SEGS[s][1], len = b - a;
      Timecode tcPos = Timecode.FromSeconds(pos), tcLen = Timecode.FromSeconds(len), tcOff = Timecode.FromSeconds(a);
      TrackEventGroup grp = new TrackEventGroup();
      vegas.Project.Groups.Add(grp);
      VideoEvent ve = new VideoEvent(tcPos, tcLen);
      vt.Events.Add(ve);
      Take vtk = ve.AddTake(media.GetVideoStreamByIndex(0));
      vtk.Offset = tcOff;
      grp.Add(ve);
      Motion(ve, CAMS[s]);
      for (int i = 0; i < AUDIO_COUNT; i++) {
        int src = i < AUDIO_ORDER.Length ? AUDIO_ORDER[i] : i;
        MediaStream ms = media.GetAudioStreamByIndex(src);
        if (ms == null) continue;
        AudioEvent ae = new AudioEvent(tcPos, tcLen);
        ats[i].Events.Add(ae);
        Take atk = ae.AddTake(ms);
        atk.Offset = tcOff;
        grp.Add(ae);
      }
      pos += len;
    }
    if (COLOR) ApplyColor(vegas, vt);
    AddSubs(vegas);
    AddSfx(vegas);
    string msg = "Listo: " + SEGS.Length + " cortes, " + SUBS.Length + " subtítulos, " + SFX.Length + " efectos de sonido.";
    if (avisos.Count > 0) msg += "\\n\\nAvisos:\\n- " + string.Join("\\n- ", avisos.ToArray());
    MessageBox.Show(msg, "AutoCut GTA");
  }

  static VideoMotionBounds Rect(double x, double y, double w, double h) {
    return new VideoMotionBounds(new VideoMotionVertex((float)x, (float)y), new VideoMotionVertex((float)(x + w), (float)y),
      new VideoMotionVertex((float)(x + w), (float)(y + h)), new VideoMotionVertex((float)x, (float)(y + h)));
  }

  static void Motion(VideoEvent ev, double[] k) {
    if (k.Length < 5) return;
    VideoMotionKeyframe first = ev.VideoMotion.Keyframes[0];
    first.Bounds = Rect(k[1], k[2], k[3], k[4]);
    first.Type = VideoKeyframeType.Smooth;
    for (int i = 5; i + 4 < k.Length; i += 5) {
      if (k[i] <= 0) continue;
      VideoMotionKeyframe kf = new VideoMotionKeyframe(Timecode.FromSeconds(k[i]));
      ev.VideoMotion.Keyframes.Add(kf);
      kf.Bounds = Rect(k[i + 1], k[i + 2], k[i + 3], k[i + 4]);
      kf.Type = VideoKeyframeType.Smooth;
    }
  }

  static void SetD(OFXEffect fx, string name, double v) {
    try { OFXDoubleParameter p = fx.FindParameterByName(name) as OFXDoubleParameter; if (p != null) p.Value = v; } catch {}
  }
  static void SetC(OFXEffect fx, string name, double r, double g, double b) {
    try { OFXRGBAParameter p = fx.FindParameterByName(name) as OFXRGBAParameter; if (p != null) p.Value = new OFXColor(r, g, b, 1); } catch {}
  }

  static void ApplyColor(Vegas vegas, VideoTrack vt) {
    try {
      PlugInNode bc = vegas.VideoFX.GetChildByName("VEGAS Brightness and Contrast");
      if (bc != null) { Effect e = vt.Effects.AddEffect(bc); SetD(e.OFXEffect, "Brightness", BRIGHT); SetD(e.OFXEffect, "Contrast", CONTRAST); }
      PlugInNode hsl = vegas.VideoFX.GetChildByName("VEGAS HSL Adjust");
      if (hsl != null) { Effect e = vt.Effects.AddEffect(hsl); SetD(e.OFXEffect, "Saturation", SAT); }
      if (Math.Abs(TEMP) > 0.01) {
        PlugInNode cb = vegas.VideoFX.GetChildByName("VEGAS Color Balance");
        if (cb != null) { Effect e = vt.Effects.AddEffect(cb); SetD(e.OFXEffect, "RedMidtones", TEMP * 0.3); SetD(e.OFXEffect, "BlueMidtones", -TEMP * 0.3); }
      }
    } catch (Exception ex) { avisos.Add("Color: " + ex.Message); }
  }

  static void AddSubs(Vegas vegas) {
    if (SUBS.Length == 0) return;
    PlugInNode gen = vegas.Generators.GetChildByName("VEGAS Titles & Text");
    if (gen == null) { avisos.Add("No encuentro el generador 'VEGAS Titles & Text'"); return; }
    Dictionary<int, VideoTrack> tracks = new Dictionary<int, VideoTrack>();
    foreach (Sub s in SUBS) {
      if (!tracks.ContainsKey(s.Track)) {
        VideoTrack t = new VideoTrack(0, "Subtítulos " + AUDIO_NAMES[s.Track - 1]);
        vegas.Project.Tracks.Add(t);
        tracks[s.Track] = t;
      }
      try {
        Media m = new Media(gen);
        VideoEvent ev = new VideoEvent(Timecode.FromSeconds(s.Pos), Timecode.FromSeconds(s.Len));
        tracks[s.Track].Events.Add(ev);
        ev.AddTake(m.GetVideoStreamByIndex(0));
        OFXEffect fx = m.Generator.OFXEffect;
        OFXStringParameter txt = fx.FindParameterByName("Text") as OFXStringParameter;
        if (txt != null) txt.Value = s.Rtf;
        SetC(fx, "TextColor", s.R, s.G, s.B);
        SetC(fx, "OutlineColor", s.SR, s.SG, s.SB);
        SetD(fx, "OutlineWidth", s.SW);
        fx.AllParametersChanged();
        Motion(ev, s.K);
      } catch (Exception ex) { avisos.Add("Subtítulo en " + s.Pos.ToString("0.00") + "s: " + ex.Message); }
    }
  }

  static void AddSfx(Vegas vegas) {
    if (SFX.Length == 0) return;
    AudioTrack at = new AudioTrack(vegas.Project.Tracks.Count, "SFX");
    vegas.Project.Tracks.Add(at);
    foreach (Fx f in SFX) {
      try {
        if (f.Path.Length > 0 && File.Exists(f.Path)) {
          Media m = new Media(f.Path);
          MediaStream ms = m.GetAudioStreamByIndex(0);
          AudioEvent ae = new AudioEvent(Timecode.FromSeconds(f.Pos), m.Length);
          at.Events.Add(ae);
          ae.AddTake(ms);
        } else {
          vegas.Project.Markers.Add(new Marker(Timecode.FromSeconds(f.Pos), "SFX: " + f.Name));
        }
      } catch (Exception ex) { avisos.Add("SFX " + f.Name + ": " + ex.Message); }
    }
  }
}
`;
}

const srtTime = (t: number) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

export function srt(subs: Subtitle[], segments: Segment[]) {
  let i = 0;
  return subs
    .map((s) => {
      const a = sourceToTimeline(s.start, segments);
      if (a == null) return "";
      return `${++i}\n${srtTime(a)} --> ${srtTime(a + s.end - s.start)}\n${s.text}\n`;
    })
    .filter(Boolean)
    .join("\n");
}
