import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileVideo, Wand2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/lib/autocut/store";
import { audioLevels, gradeFromStats, probeVideo, sampleColor } from "@/lib/autocut/media";
import { TRACK_NAMES } from "@/lib/autocut/subtitles";
import type { TrackNo } from "@/lib/autocut/types";
import { desktop } from "@/lib/autocut/desktop";
import { NumField, Section, SelectField, SwitchField } from "./fields";

export function AutoPanel() {
  const st = useEditor();
  const { settings: c, setSettings, templates } = st;
  const vid = useRef<HTMLInputElement>(null);
  const file = useRef<File | null>(null);
  const [busy, setBusy] = useState("");
  const [folder, setFolder] = useState("");

  const openVideo = async (f: File) => {
    file.current = f;
    const url = URL.createObjectURL(f);
    try {
      const meta = await probeVideo(url);
      st.setVideo(url, f.name, meta);
      toast.success(`Vídeo cargado: ${meta.width}x${meta.height}`);
    } catch { toast.error("Tu navegador no puede leer este vídeo"); }
  };

  const dk = desktop();

  const openDesktop = async () => {
    const d = dk!;
    const f = await d.pickVideo();
    if (!f) return;
    try {
      const meta = await d.probe(f.path);
      st.setVideo(f.url, f.name, meta);
      st.setVideoPath(f.path);
      st.setAnalysis(null);
      toast.success(`${meta.width}x${meta.height} · ${meta.audioCount} pistas de audio detectadas`);
    } catch (e) { toast.error("No se pudo leer el vídeo: " + String(e)); }
  };

  // Un solo botón: detecta y separa las pistas, mide el audio, transcribe y genera el proyecto.
  const run = async () => {
    if (!st.videoUrl) { toast.error("Abre primero el vídeo"); return; }
    try {
      if (dk) {
        if (!st.videoPath) { toast.error("Abre el vídeo con el botón “Abrir vídeo”"); return; }
        setBusy("Detectando pistas de audio…");
        const off = dk.onProgress(({ step, pct }) => setBusy(pct >= 0 && pct > 0 ? `${step} ${pct}%` : step));
        try {
          const r = await dk.analyze(st.videoPath);
          st.setAnalysis(r.analysis);
          setFolder(r.folder);
          if (r.warning) toast.warning(r.warning, { duration: 10000 });
        } finally { off(); }
      } else {
        // Navegador: solo puede leer la primera pista.
        if (!file.current) { toast.error("Abre primero el vídeo"); return; }
        setBusy("Leyendo audio (en el navegador solo la pista 1)…");
        const levels = await audioLevels(file.current);
        st.setAnalysis({ version: 1, duration: st.duration, width: st.width, height: st.height, fps: 60, audioCount: 1, win: 0.05, levels: { "1": levels }, words: [] });
      }
      setBusy("Generando proyecto…");
      st.runAuto();
      if (c.colorAuto && st.videoUrl) {
        setBusy("Analizando el color de la grabación…");
        try { st.setColor(gradeFromStats(await sampleColor(st.videoUrl))); } catch { /* sin color */ }
      }
      const s = useEditor.getState();
      toast.success(`Proyecto listo: ${Object.keys(s.analysis?.levels ?? {}).length} pistas, ${s.segments.length} cortes, ${s.subtitles.length} subtítulos`);
    } catch (e) {
      toast.error("No se pudo analizar el vídeo: " + String(e));
    }
    setBusy("");
  };

  const trackLabel = (k: string) => st.analysis?.trackNames?.[k] || TRACK_NAMES[+k as TrackNo];

  const tplOptions = templates.map((t) => ({ value: t.id, label: t.name }));

  return (
    <div className="space-y-3 text-sm">
      <Section title="1 · Grabación">
        <input ref={vid} type="file" accept="video/*,.mkv" hidden onChange={(e) => e.target.files?.[0] && openVideo(e.target.files[0])} />
        <Button className="w-full" onClick={() => (dk ? openDesktop() : vid.current?.click())} disabled={!!busy}><FileVideo /> Abrir vídeo</Button>
        <p className="truncate text-xs text-muted-foreground">{st.videoName || "Ninguna grabación"}</p>
        <Button className="w-full" size="lg" onClick={run} disabled={!!busy || !st.videoUrl}><Wand2 /> {busy || "Analizar y crear proyecto"}</Button>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ruta del vídeo en tu PC (para Vegas)
          <Input className="h-8 font-mono text-xs" value={st.videoPath} onChange={(e) => st.setVideoPath(e.target.value)} placeholder="D:\Grabaciones\partida.mkv" />
        </label>
        <p className="text-xs text-muted-foreground">
          {st.analysis
            ? `Pistas: ${Object.keys(st.analysis.levels).map((k) => `${k} · ${trackLabel(k)}`).join(", ")} · ${st.analysis.words.length} palabras`
            : dk ? "Al analizar se detectan y separan solas todas las pistas de audio (hasta 4)." : "En el navegador solo se lee la pista 1. Usa el programa de escritorio para las 4 pistas."}
        </p>
        {dk && folder && <Button variant="outline" size="sm" className="w-full" onClick={() => dk.openFolder(folder)}><FolderOpen /> Ver pistas separadas</Button>}
      </Section>

      <Section title="2 · Cortes">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Silencio mínimo (s)" value={c.minSilence} onChange={(v) => setSettings({ minSilence: v })} />
          <NumField label="Umbral voz (dB)" value={c.thresholdDb} step={1} onChange={(v) => setSettings({ thresholdDb: v })} />
          <NumField label="Margen antes (s)" value={c.padBefore} onChange={(v) => setSettings({ padBefore: v })} />
          <NumField label="Margen después (s)" value={c.padAfter} onChange={(v) => setSettings({ padAfter: v })} />
        </div>
        <SwitchField label="Contar voces del juego como “otros hablando”" checked={c.useGameVoice} onChange={(v) => setSettings({ useGameVoice: v })} />
      </Section>

      <Section title="3 · Zoom">
        <SwitchField label="Zoom inteligente" checked={c.zoomEnabled} onChange={(v) => setSettings({ zoomEnabled: v })} />
        <SwitchField label="Solo en conversaciones" checked={c.zoomOnlyDialogue} onChange={(v) => setSettings({ zoomOnlyDialogue: v })} />
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Zoom inicial" value={c.zoomStart} onChange={(v) => setSettings({ zoomStart: v })} />
          <NumField label="Zoom final" value={c.zoomEnd} onChange={(v) => setSettings({ zoomEnd: v })} />
        </div>
        <SelectField label="Movimiento" value={c.zoomDirection} onChange={(v) => setSettings({ zoomDirection: v })} options={[{ value: "out", label: "Alejarse suavemente" }, { value: "in", label: "Acercarse suavemente" }, { value: "combined", label: "Combinar" }]} />
      </Section>

      <Section title="4 · Subtítulos">
        <SwitchField label="Subtítulos automáticos" checked={c.subsEnabled} onChange={(v) => setSettings({ subsEnabled: v })} />
        <SelectField label="Palabras por subtítulo" value={String(c.groupSize)} onChange={(v) => setSettings({ groupSize: v === "auto" ? "auto" : (+v as 1 | 2 | 3) })}
          options={[{ value: "auto", label: "Dinámico (el programa elige)" }, { value: "1", label: "1 palabra" }, { value: "2", label: "2 palabras" }, { value: "3", label: "3 palabras" }]} />
        {([1, 2, 3, 4] as TrackNo[]).map((t) => (
          <div key={t} className="flex items-center gap-2">
            <input type="color" aria-label={`Color ${TRACK_NAMES[t]}`} value={c.trackColors[t]} onChange={(e) => setSettings({ trackColors: { ...c.trackColors, [t]: e.target.value } })} className="h-6 w-8 cursor-pointer rounded border border-input bg-transparent" />
            <div className="flex-1"><SwitchField label={`Pista ${t} · ${TRACK_NAMES[t]}`} checked={c.trackEnabled[t]} onChange={(v) => setSettings({ trackEnabled: { ...c.trackEnabled, [t]: v } })} /></div>
          </div>
        ))}
        <SelectField label="Plantilla normal" value={c.defaultTemplate} onChange={(v) => setSettings({ defaultTemplate: v })} options={tplOptions} />
        <SwitchField label="Elegir plantilla según el tono (gritos)" checked={c.autoTemplate} onChange={(v) => setSettings({ autoTemplate: v })} />
        <SelectField label="Plantilla para gritos" value={c.shoutTemplate} onChange={(v) => setSettings({ shoutTemplate: v })} options={tplOptions} />
        <NumField label="Nivel de grito (dB)" value={c.shoutDb} step={1} onChange={(v) => setSettings({ shoutDb: v })} />
        <SwitchField label="Acercar la cámara en los gritos" checked={c.shoutPunch} onChange={(v) => setSettings({ shoutPunch: v })} />
      </Section>

      <Section title="5 · Color y sonido">
        <SwitchField label="Corrector de color automático" checked={c.colorAuto} onChange={(v) => setSettings({ colorAuto: v })} />
        <SwitchField label="Efecto de sonido en cada grito" checked={c.sfxAuto} onChange={(v) => setSettings({ sfxAuto: v })} />
        {c.sfxAuto && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Nombre del efecto<Input className="h-8" value={c.sfxShoutName} onChange={(e) => setSettings({ sfxShoutName: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Ruta del sonido (.wav/.mp3)<Input className="h-8 font-mono text-xs" value={c.sfxShoutPath} placeholder="D:\SFX\impacto.wav" onChange={(e) => setSettings({ sfxShoutPath: e.target.value })} /></label>
          </>
        )}
      </Section>

    </div>
  );
}
