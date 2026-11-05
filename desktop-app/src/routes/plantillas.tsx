import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Plus, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubtitleView } from "@/components/autocut/SubtitleView";
import { NumField, Section, SelectField, SwitchField } from "@/components/autocut/fields";
import { useEditor } from "@/lib/autocut/store";
import { uid } from "@/lib/autocut/core";
import { BUILT_IN_TEMPLATES, TRACK_NAMES } from "@/lib/autocut/subtitles";
import type { Animation, SubTemplate, TrackNo } from "@/lib/autocut/types";

export const Route = createFileRoute("/plantillas")({
  head: () => ({
    meta: [
      { title: "Plantillas de subtítulos · AutoCut GTA" },
      { name: "description", content: "Crea plantillas de subtítulos animados (vibrar, crecer, deslizar) con Impact para tus vídeos de GTA." },
      { property: "og:title", content: "Plantillas de subtítulos · AutoCut GTA" },
      { property: "og:description", content: "Editor de plantillas de subtítulos dinámicos para Vegas Pro 23." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Templates,
});

const ANIMS: { value: Animation; label: string }[] = [
  { value: "none", label: "Sin animación" },
  { value: "pop", label: "Aparecer de golpe (pop)" },
  { value: "slide-rl", label: "Deslizar derecha → izquierda" },
  { value: "grow", label: "Hacerse más grande" },
  { value: "bounce", label: "Rebote" },
  { value: "shake", label: "Vibrar" },
  { value: "shake-grow", label: "Vibrar y crecer" },
];

function Templates() {
  const { templates, saveTemplate, deleteTemplate, settings } = useEditor();
  const [selId, setSelId] = useState(templates[0]?.id);
  const [sample, setSample] = useState("¡NO ME LO PUEDO CREER!");
  const [track, setTrack] = useState<TrackNo>(1);
  const [replay, setReplay] = useState(0);
  const t = (templates.find((x) => x.id === selId) ?? templates[0] ?? BUILT_IN_TEMPLATES[0])!;
  const set = (p: Partial<SubTemplate>) => { saveTemplate({ ...t, ...p }); setReplay((r) => r + 1); };
  const add = (from?: SubTemplate) => {
    const n: SubTemplate = { ...(from ?? t), id: uid(), name: from ? `${from.name} (copia)` : "Nueva plantilla", builtIn: false };
    saveTemplate(n); setSelId(n.id);
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h1 className="font-display text-2xl tracking-wider">AUTOCUT <span className="text-primary">GTA</span></h1>
        <nav className="ml-4 flex gap-1">
          <Button variant="ghost" size="sm" asChild><a href="/">Editor</a></Button>
          <Button variant="secondary" size="sm" asChild><a href="/plantillas">Plantillas</a></Button>
        </nav>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 space-y-1 overflow-y-auto border-r p-3">
          <Button className="mb-2 w-full" size="sm" onClick={() => add()}><Plus /> Nueva plantilla</Button>
          {templates.map((x) => (
            <button key={x.id} onClick={() => { setSelId(x.id); setReplay((r) => r + 1); }}
              className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${x.id === t.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>
              {x.name}
              {settings.shoutTemplate === x.id && <span className="ml-1 text-xs text-destructive">· gritos</span>}
              {settings.defaultTemplate === x.id && <span className="ml-1 text-xs text-primary">· normal</span>}
            </button>
          ))}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-3">
          <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-md bg-stage" onClick={() => setReplay((r) => r + 1)}>
            <div className="absolute inset-0 bg-gradient-to-br from-lane-video/40 via-stage to-lane-zoom/30" />
            <SubtitleView template={t} color={t.useTrackColor ? settings.trackColors[track] : t.fill} text={sample} stageHeight={Math.min(900, 504)} duration={1.5} animKey={replay} />
            <span className="absolute right-2 top-2 text-xs text-muted-foreground">Haz clic para repetir la animación</span>
          </div>
          <div className="flex max-w-4xl gap-2">
            <Input value={sample} onChange={(e) => setSample(e.target.value)} />
            <select className="rounded-md border border-input bg-background px-2 text-sm" value={track} onChange={(e) => setTrack(+e.target.value as TrackNo)}>
              {([1, 2, 3, 4] as TrackNo[]).map((n) => <option key={n} value={n}>Pista {n} · {TRACK_NAMES[n]}</option>)}
            </select>
            <Button variant="outline" onClick={() => setReplay((r) => r + 1)}><RotateCcw /></Button>
          </div>
        </main>
        <aside className="w-80 shrink-0 space-y-3 overflow-y-auto border-l p-3">
          <Section title="Plantilla">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Nombre<Input value={t.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <SelectField label="Fuente" value={t.font} onChange={(v) => set({ font: v })} options={["Impact", "Arial Black", "Bebas Neue", "Anton", "Montserrat"].map((f) => ({ value: f, label: f }))} />
            <SelectField label="Animación" value={t.animation} onChange={(v) => set({ animation: v })} options={ANIMS} />
            <SelectField label="Posición" value={t.position} onChange={(v) => set({ position: v })} options={[{ value: "bottom", label: "Abajo" }, { value: "center", label: "Centro" }, { value: "top", label: "Arriba" }]} />
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Tamaño (% alto)" value={t.size} step={0.5} onChange={(v) => set({ size: v })} />
              <NumField label="Contorno (px)" value={t.strokeWidth} step={1} onChange={(v) => set({ strokeWidth: v })} />
            </div>
            <SwitchField label="Color según quién habla (pista)" checked={t.useTrackColor} onChange={(v) => set({ useTrackColor: v })} />
            {!t.useTrackColor && <label className="flex items-center justify-between text-xs">Color de letra<input type="color" value={t.fill} onChange={(e) => set({ fill: e.target.value })} /></label>}
            <label className="flex items-center justify-between text-xs">Color del contorno<input type="color" value={t.stroke} onChange={(e) => set({ stroke: e.target.value })} /></label>
            <SwitchField label="MAYÚSCULAS" checked={t.uppercase} onChange={(v) => set({ uppercase: v })} />
          </Section>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => add(t)}><Copy /> Duplicar</Button>
            {!t.builtIn && <Button variant="destructive" size="sm" onClick={() => { deleteTemplate(t.id); setSelId(templates[0]?.id); }}><Trash2 /> Borrar</Button>}
          </div>
          <Section title="Uso automático">
            <Button variant="outline" size="sm" className="w-full" onClick={() => useEditor.getState().setSettings({ defaultTemplate: t.id })}>Usar para frases normales</Button>
            <Button variant="outline" size="sm" className="w-full" onClick={() => useEditor.getState().setSettings({ shoutTemplate: t.id, autoTemplate: true })}>Usar cuando haya un grito</Button>
          </Section>
        </aside>
      </div>
    </div>
  );
}
