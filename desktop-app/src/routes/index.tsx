import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { FileCode2, Plus, Subtitles, Undo2, Music, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoPanel } from "@/components/autocut/AutoPanel";
import { Inspector } from "@/components/autocut/Inspector";
import { Preview } from "@/components/autocut/Preview";
import { Timeline } from "@/components/autocut/Timeline";
import { useEditor } from "@/lib/autocut/store";
import { usePlayer } from "@/lib/autocut/player";
import { uid } from "@/lib/autocut/core";
import { download } from "@/lib/autocut/media";
import { srt, vegasScript } from "@/lib/autocut/vegas";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AutoCut GTA · Editor" },
      { name: "description", content: "Editor automático de cortes, zooms, subtítulos y color para vídeos de GTA, con exportación a Vegas Pro 23." },
      { property: "og:title", content: "AutoCut GTA · Editor" },
      { property: "og:description", content: "Cortes por voz, zoom inteligente, subtítulos dinámicos y exportación a Vegas Pro 23." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Editor,
});

function splitAt(t: number) {
  const st = useEditor.getState();
  const seg = st.segments.find((s) => t > s.start + 0.05 && t < s.end - 0.05);
  if (!seg) return;
  const b = { id: uid(), start: +t.toFixed(3), end: seg.end };
  st.commit((d) => {
    const z = d.zooms.find((x) => x.segmentId === seg.id);
    return {
      segments: d.segments.flatMap((s) => (s.id === seg.id ? [{ ...s, end: +t.toFixed(3) }, b] : [s])),
      zooms: z ? [...d.zooms, { ...z, segmentId: b.id }] : d.zooms,
    };
  });
}

function Editor() {
  const st = useEditor();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      const s = useEditor.getState();
      const p = usePlayer.getState();
      if (e.code === "Space") {
        e.preventDefault();
        const v = p.video;
        if (v) { if (v.paused) { v.play(); p.setPlaying(true); } else { v.pause(); p.setPlaying(false); } }
      } else if (e.key === "s" || e.key === "S") splitAt(p.time);
      else if ((e.key === "Delete" || e.key === "Backspace") && s.selection) {
        const sel = s.selection;
        s.commit((d) => sel.kind === "segment" ? { segments: d.segments.filter((x) => x.id !== sel.id) } : sel.kind === "subtitle" ? { subtitles: d.subtitles.filter((x) => x.id !== sel.id) } : { sfx: d.sfx.filter((x) => x.id !== sel.id) });
        s.select(null);
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); s.undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addSub = () => {
    const t = usePlayer.getState().time;
    const id = uid();
    st.commit((d) => ({ subtitles: [...d.subtitles, { id, start: t, end: t + 1, text: "Texto", track: 1 as const, templateId: st.settings.defaultTemplate, shout: false, punch: false }].sort((a, b) => a.start - b.start) }));
    st.select({ kind: "subtitle", id });
  };
  const addSfx = () => {
    const id = uid();
    st.commit((d) => ({ sfx: [...d.sfx, { id, at: usePlayer.getState().time, name: "Efecto", path: st.settings.sfxShoutPath }] }));
    st.select({ kind: "sfx", id });
  };

  const base = (st.videoName || "proyecto").replace(/\.[^.]+$/, "");
  const exportVegas = () => {
    if (!st.segments.length) { toast.error("Primero crea el proyecto (no hay cortes)"); return; }
    if (!/^[a-zA-Z]:\\/.test(st.videoPath)) toast.warning("Revisa la ruta del vídeo: debe ser la ruta completa en tu PC");
    download(`${base}_vegas.cs`, vegasScript({
      videoPath: st.videoPath, width: st.width, height: st.height,
      audioCount: st.analysis?.audioCount ?? 4,
      segments: st.segments, zooms: st.zooms, subtitles: st.subtitles, templates: st.templates, sfx: st.sfx, color: st.color, settings: st.settings,
    }), "text/plain", st.videoPath);
    toast.success("Script de Vegas descargado");
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h1 className="font-display text-2xl tracking-wider">AUTOCUT <span className="text-primary">GTA</span></h1>
        <nav className="ml-4 flex gap-1">
          <Button variant="secondary" size="sm" asChild><a href="/">Editor</a></Button>
          <Button variant="ghost" size="sm" asChild><a href="/plantillas"><Subtitles /> Plantillas</a></Button>
        </nav>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" onClick={st.undo} disabled={!st.past.length}><Undo2 /> Deshacer</Button>
          <Button variant="ghost" size="sm" onClick={() => splitAt(usePlayer.getState().time)}><Scissors /> Dividir</Button>
          <Button variant="ghost" size="sm" onClick={addSub}><Plus /> Subtítulo</Button>
          <Button variant="ghost" size="sm" onClick={addSfx}><Music /> SFX</Button>
          <Button variant="outline" size="sm" onClick={() => download(`${base}.srt`, srt(st.subtitles, st.segments), "text/plain", st.videoPath)} disabled={!st.subtitles.length}>.srt</Button>
          <Button size="sm" onClick={exportVegas}><FileCode2 /> Exportar a Vegas (.cs)</Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r p-3">
          <Tabs defaultValue="auto">
            <TabsList className="mb-3 grid w-full grid-cols-2">
              <TabsTrigger value="auto">Automático</TabsTrigger>
              <TabsTrigger value="edit">Editar</TabsTrigger>
            </TabsList>
            <TabsContent value="auto"><AutoPanel /></TabsContent>
            <TabsContent value="edit"><Inspector /></TabsContent>
          </Tabs>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-2 p-2">
          <div className="min-h-0 flex-[3]"><Preview /></div>
          <div className="min-h-[220px] flex-[2]"><Timeline /></div>
        </main>
      </div>
    </div>
  );
}
