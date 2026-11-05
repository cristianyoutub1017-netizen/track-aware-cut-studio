import type { ColorGrade } from "./types";

// Niveles RMS (dB) por ventanas de `win` s de un archivo de audio/vídeo (primera pista).
export async function audioLevels(file: File, win = 0.05): Promise<number[]> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const ch = buf.getChannelData(0);
    const hop = Math.max(1, Math.round(buf.sampleRate * win));
    const n = Math.floor(ch.length / hop);
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = i * hop; j < (i + 1) * hop; j++) s += ch[j]! * ch[j]!;
      out[i] = +(10 * Math.log10(s / hop + 1e-12)).toFixed(1);
    }
    return out;
  } finally {
    ctx.close();
  }
}

export function probeVideo(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => res({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => rej(new Error("No se pudo leer el vídeo"));
    v.src = url;
  });
}

export interface FrameStats {
  luma: number; // 0..1
  contrast: number; // desviación de luma
  sat: number; // 0..1
  warmth: number; // (R-B) -1..1
}

// Toma muestras de la grabación y mide luz, contraste, saturación y temperatura.
export async function sampleColor(url: string, samples = 12): Promise<FrameStats> {
  const v = document.createElement("video");
  v.muted = true;
  v.src = url;
  await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; });
  const c = document.createElement("canvas");
  c.width = 160; c.height = 90;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  let L = 0, L2 = 0, S = 0, W = 0, n = 0;
  for (let k = 0; k < samples; k++) {
    v.currentTime = (v.duration * (k + 0.5)) / samples;
    await new Promise((r) => (v.onseeked = r));
    g.drawImage(v, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data;
    for (let i = 0; i < d.length; i += 16) {
      const r = d[i]! / 255, gr = d[i + 1]! / 255, b = d[i + 2]! / 255;
      const l = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      const mx = Math.max(r, gr, b), mn = Math.min(r, gr, b);
      L += l; L2 += l * l; S += mx ? (mx - mn) / mx : 0; W += r - b; n++;
    }
  }
  const luma = L / n;
  return { luma, contrast: Math.sqrt(Math.max(0, L2 / n - luma * luma)), sat: S / n, warmth: W / n };
}

// Decide la corrección según el tipo de imagen de la grabación del juego.
export function gradeFromStats(st: FrameStats): ColorGrade {
  const looks: string[] = [];
  let brightness = 0, contrast = 0, saturation = 1, temperature = 0;
  if (st.luma < 0.28) { brightness = Math.min(0.25, (0.38 - st.luma) * 0.9); looks.push("noche / oscuro: levantar sombras"); }
  else if (st.luma > 0.62) { brightness = -Math.min(0.15, (st.luma - 0.55) * 0.6); looks.push("sobreexpuesto: bajar luces"); }
  if (st.contrast < 0.18) { contrast = Math.min(0.3, (0.22 - st.contrast) * 2.5); looks.push("lavado: más contraste"); }
  if (st.sat < 0.28) { saturation = +(1 + Math.min(0.4, (0.35 - st.sat) * 2)).toFixed(2); looks.push("apagado: más color"); }
  else if (st.sat > 0.6) { saturation = 0.9; looks.push("saturado: suavizar color"); }
  if (st.warmth > 0.08) { temperature = -Math.min(0.4, st.warmth * 2); looks.push("dominante cálida: enfriar"); }
  else if (st.warmth < -0.06) { temperature = Math.min(0.4, -st.warmth * 2); looks.push("dominante fría: calentar"); }
  return {
    enabled: true,
    brightness: +brightness.toFixed(3),
    contrast: +contrast.toFixed(3),
    saturation,
    temperature: +temperature.toFixed(3),
    look: looks.length ? looks.join(" · ") : "equilibrado: retoque suave",
  };
}

export const NEUTRAL_GRADE: ColorGrade = { enabled: false, brightness: 0, contrast: 0, saturation: 1, temperature: 0, look: "sin analizar" };

export function cssFilter(g: ColorGrade) {
  if (!g.enabled) return "none";
  const sepia = g.temperature > 0 ? g.temperature * 0.3 : 0;
  const hue = g.temperature < 0 ? g.temperature * 12 : 0;
  return `brightness(${1 + g.brightness}) contrast(${1 + g.contrast}) saturate(${g.saturation}) sepia(${sepia}) hue-rotate(${hue}deg)`;
}

export function download(name: string, content: string, type = "text/plain", nearPath?: string) {
  const d = (window as unknown as { autocut?: { saveText: (p: string, c: string) => Promise<string | null> } }).autocut;
  if (d) {
    const dir = nearPath ? nearPath.replace(/[\\/][^\\/]*$/, "") : "";
    void d.saveText(dir ? `${dir}\\${name}` : name, content);
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
