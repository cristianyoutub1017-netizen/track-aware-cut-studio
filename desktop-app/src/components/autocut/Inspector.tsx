import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/lib/autocut/store";
import { uid } from "@/lib/autocut/core";
import { TRACK_NAMES } from "@/lib/autocut/subtitles";
import type { ColorGrade, TrackNo } from "@/lib/autocut/types";
import { NumField, Section, SelectField, SwitchField } from "./fields";

export function Inspector() {
  const st = useEditor();
  const { selection: sel, commit, templates } = st;

  const colorUi = (
    <Section title="Color">
      <SwitchField label="Aplicar corrección de color" checked={st.color.enabled} onChange={(v) => st.setColor({ enabled: v })} />
      <p className="text-xs text-muted-foreground">Detectado: {st.color.look}</p>
      {([
        ["brightness", "Brillo", -0.5, 0.5],
        ["contrast", "Contraste", -0.5, 0.5],
        ["saturation", "Saturación", 0, 2],
        ["temperature", "Temperatura", -1, 1],
      ] as [keyof ColorGrade, string, number, number][]).map(([k, label, min, max]) => (
        <div key={k} className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground"><span>{label}</span><span>{(st.color[k] as number).toFixed(2)}</span></div>
          <Slider min={min} max={max} step={0.01} value={[st.color[k] as number]} onValueChange={([v]) => st.setColor({ [k]: v })} />
        </div>
      ))}
    </Section>
  );

  if (!sel) return <div className="space-y-3"><p className="text-sm text-muted-foreground">Selecciona un corte, subtítulo o efecto en la línea de tiempo para editarlo.</p>{colorUi}</div>;

  if (sel.kind === "segment") {
    const s = st.segments.find((x) => x.id === sel.id);
    if (!s) return null;
    const z = st.zooms.find((x) => x.segmentId === s.id) ?? { segmentId: s.id, enabled: false, from: 1.3, to: 1.1, cx: 0.5, cy: 0.55, who: "me" as const };
    const setSeg = (p: Partial<typeof s>) => commit((d) => ({ segments: d.segments.map((x) => (x.id === s.id ? { ...x, ...p } : x)) }));
    const setZ = (p: Partial<typeof z>) => commit((d) => ({ zooms: d.zooms.some((x) => x.segmentId === s.id) ? d.zooms.map((x) => (x.segmentId === s.id ? { ...x, ...p } : x)) : [...d.zooms, { ...z, ...p }] }));
    return (
      <div className="space-y-3">
        <Section title="Corte">
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Inicio (s original)" value={s.start} step={0.01} onChange={(v) => setSeg({ start: v })} />
            <NumField label="Fin (s original)" value={s.end} step={0.01} onChange={(v) => setSeg({ end: v })} />
          </div>
          <SelectField label="Grupo de palabras en este tramo" value={String(st.overrides.find((o) => o.start === s.start && o.end === s.end)?.size ?? "global")}
            onChange={(v) => {
              const rest = st.overrides.filter((o) => !(o.start === s.start && o.end === s.end));
              st.setOverrides(v === "global" ? rest : [...rest, { id: uid(), start: s.start, end: s.end, size: +v as 1 | 2 | 3 }]);
              st.rebuildSubtitles();
            }}
            options={[{ value: "global", label: "Como el resto" }, { value: "1", label: "1 palabra" }, { value: "2", label: "2 palabras" }, { value: "3", label: "3 palabras" }]} />
          <Button variant="destructive" size="sm" onClick={() => commit((d) => ({ segments: d.segments.filter((x) => x.id !== s.id) }))}><Trash2 /> Quitar este trozo</Button>
        </Section>
        <Section title="Zoom del corte">
          <SwitchField label="Zoom activado" checked={z.enabled} onChange={(v) => setZ({ enabled: v })} />
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Zoom al empezar" value={z.from} onChange={(v) => setZ({ from: v })} min={1} />
            <NumField label="Zoom al acabar" value={z.to} onChange={(v) => setZ({ to: v })} min={1} />
            <NumField label="Centro X (0-1)" value={z.cx} step={0.01} onChange={(v) => setZ({ cx: v })} />
            <NumField label="Centro Y (0-1)" value={z.cy} step={0.01} onChange={(v) => setZ({ cy: v })} />
          </div>
        </Section>
      </div>
    );
  }

  if (sel.kind === "subtitle") {
    const s = st.subtitles.find((x) => x.id === sel.id);
    if (!s) return null;
    const set = (p: Partial<typeof s>) => commit((d) => ({ subtitles: d.subtitles.map((x) => (x.id === s.id ? { ...x, ...p } : x)) }));
    return (
      <Section title="Subtítulo">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Texto<Input value={s.text} onChange={(e) => set({ text: e.target.value })} /></label>
        <SelectField label="Quién habla (pista)" value={String(s.track)} onChange={(v) => set({ track: +v as TrackNo })} options={([1, 2, 3, 4] as TrackNo[]).map((t) => ({ value: String(t), label: `${t} · ${TRACK_NAMES[t]}` }))} />
        <SelectField label="Plantilla" value={s.templateId} onChange={(v) => set({ templateId: v })} options={templates.map((t) => ({ value: t.id, label: t.name }))} />
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Inicio (s original)" value={s.start} step={0.01} onChange={(v) => set({ start: v })} />
          <NumField label="Fin (s original)" value={s.end} step={0.01} onChange={(v) => set({ end: v })} />
        </div>
        <SwitchField label="Acercar cámara mientras sale" checked={s.punch} onChange={(v) => set({ punch: v })} />
        <Button variant="destructive" size="sm" onClick={() => commit((d) => ({ subtitles: d.subtitles.filter((x) => x.id !== s.id) }))}><Trash2 /> Borrar subtítulo</Button>
      </Section>
    );
  }

  const f = st.sfx.find((x) => x.id === sel.id);
  if (!f) return null;
  const set = (p: Partial<typeof f>) => commit((d) => ({ sfx: d.sfx.map((x) => (x.id === f.id ? { ...x, ...p } : x)) }));
  return (
    <Section title="Efecto de sonido">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Nombre<Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Ruta en tu PC (si falta, Vegas pone un marcador)<Input className="font-mono text-xs" value={f.path} placeholder="D:\SFX\boom.wav" onChange={(e) => set({ path: e.target.value })} /></label>
      <NumField label="Momento (s original)" value={f.at} step={0.01} onChange={(v) => set({ at: v })} />
      <Button variant="destructive" size="sm" onClick={() => commit((d) => ({ sfx: d.sfx.filter((x) => x.id !== f.id) }))}><Trash2 /> Borrar efecto</Button>
    </Section>
  );
}
