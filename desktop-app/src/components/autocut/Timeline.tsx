import { useRef, useState, type PointerEvent as RPE } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/autocut/store";
import { usePlayer } from "@/lib/autocut/player";
import { editedDuration, sourceToTimeline, timelineToSource } from "@/lib/autocut/core";
import { TRACK_NAMES } from "@/lib/autocut/subtitles";
import type { Segment, TrackNo } from "@/lib/autocut/types";

const LABEL_W = 110;

export function Timeline() {
  const { segments, zooms, subtitles, sfx, settings, selection, select, commit } = useEditor();
  const { time, seek } = usePlayer();
  const [pps, setPps] = useState(40); // píxeles por segundo
  const scroller = useRef<HTMLDivElement>(null);
  const total = editedDuration(segments);
  const widthPx = Math.max(800, total * pps + 200);

  // posición editada del inicio de cada segmento
  const segPos: Record<string, number> = {};
  let acc = 0;
  for (const s of segments) { segPos[s.id] = acc; acc += s.end - s.start; }

  const toX = (src: number) => { const p = sourceToTimeline(src, segments); return p == null ? null : p * pps; };
  const playX = toX(time);

  const seekFromEvent = (e: RPE<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    seek(timelineToSource(Math.max(0, x / pps), segments));
  };

  // Arrastre genérico: devuelve delta en segundos
  const drag = (e: RPE, onMove: (d: number) => void) => {
    e.stopPropagation();
    const x0 = e.clientX;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started) { started = true; }
      onMove((ev.clientX - x0) / pps);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const trimSeg = (e: RPE, seg: Segment, side: "start" | "end") => {
    const orig = { ...seg };
    let first = true;
    drag(e, (d) => {
      const apply = (s: { segments: Segment[] }) => ({
        segments: s.segments.map((x) =>
          x.id !== seg.id ? x : side === "start"
            ? { ...x, start: +Math.min(orig.end - 0.1, Math.max(0, orig.start + d)).toFixed(3) }
            : { ...x, end: +Math.max(orig.start + 0.1, orig.end + d).toFixed(3) },
        ),
      });
      if (first) { commit(apply); first = false; }
      else useEditor.setState((s) => apply(s));
    });
  };

  const moveSub = (e: RPE, id: string, mode: "move" | "start" | "end") => {
    const orig = subtitles.find((s) => s.id === id)!;
    select({ kind: "subtitle", id });
    let first = true;
    drag(e, (d) => {
      const apply = (s: { subtitles: typeof subtitles }) => ({
        subtitles: s.subtitles.map((x) => {
          if (x.id !== id) return x;
          if (mode === "move") return { ...x, start: +(orig.start + d).toFixed(3), end: +(orig.end + d).toFixed(3) };
          if (mode === "start") return { ...x, start: +Math.min(orig.end - 0.05, orig.start + d).toFixed(3) };
          return { ...x, end: +Math.max(orig.start + 0.05, orig.end + d).toFixed(3) };
        }),
      });
      if (first) { commit(apply); first = false; }
      else useEditor.setState((s) => apply(s));
    });
  };

  const ticks: number[] = [];
  const step = pps > 80 ? 1 : pps > 25 ? 5 : pps > 8 ? 15 : 60;
  for (let t = 0; t <= total + step; t += step) ticks.push(t);

  const lanes: { key: string; label: string; color?: string }[] = [
    { key: "video", label: "Vídeo / cortes" },
    { key: "zoom", label: "Zoom" },
    ...([1, 2, 3, 4] as TrackNo[]).filter((t) => settings.trackEnabled[t] || subtitles.some((s) => s.track === t)).map((t) => ({ key: `sub${t}`, label: `Subs ${TRACK_NAMES[t]}`, color: settings.trackColors[t] })),
    { key: "sfx", label: "Efectos sonido" },
  ];
  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id;

  return (
    <div className="flex h-full flex-col rounded-md border bg-card">
      <div className="flex items-center gap-2 border-b px-2 py-1 text-xs text-muted-foreground">
        <span className="font-display text-base tracking-wide text-foreground">Línea de tiempo</span>
        <span>{segments.length} cortes · {subtitles.length} subtítulos · {sfx.length} SFX</span>
        <span className="ml-auto hidden md:inline">Espacio: reproducir · S: dividir · Supr: borrar · Ctrl+Z: deshacer</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPps((p) => Math.max(2, p / 1.5))} aria-label="Alejar"><ZoomOut /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPps((p) => Math.min(400, p * 1.5))} aria-label="Acercar"><ZoomIn /></Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="shrink-0 border-r" style={{ width: LABEL_W }}>
          <div className="h-6 border-b" />
          {lanes.map((l) => (
            <div key={l.key} className="flex h-10 items-center gap-1.5 border-b px-2 text-xs">
              {l.color && <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ background: l.color }} />}
              <span className="truncate">{l.label}</span>
            </div>
          ))}
        </div>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ width: widthPx }}>
            <div className="relative h-6 cursor-pointer border-b bg-muted/40" onPointerDown={seekFromEvent}>
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 h-full border-l border-border pl-1 font-mono text-[10px] text-muted-foreground" style={{ left: t * pps }}>
                  {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, "0")}
                </span>
              ))}
            </div>
            {lanes.map((l) => (
              <div key={l.key} className="relative h-10 border-b" onPointerDown={seekFromEvent}>
                {l.key === "video" && segments.map((s) => (
                  <div key={s.id} onPointerDown={(e) => { e.stopPropagation(); select({ kind: "segment", id: s.id }); seek(s.start); }}
                    className={`absolute top-1 bottom-1 overflow-hidden rounded-sm border bg-lane-video/70 text-[10px] text-foreground ${isSel("segment", s.id) ? "ring-2 ring-ring" : ""}`}
                    style={{ left: (segPos[s.id] ?? 0) * pps, width: Math.max(2, (s.end - s.start) * pps - 1) }}>
                    <span className="px-1">{s.start.toFixed(1)}s</span>
                    <span onPointerDown={(e) => trimSeg(e, s, "start")} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-foreground/30" />
                    <span onPointerDown={(e) => trimSeg(e, s, "end")} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-foreground/30" />
                  </div>
                ))}
                {l.key === "zoom" && segments.map((s) => {
                  const z = zooms.find((x) => x.segmentId === s.id);
                  if (!z?.enabled) return null;
                  return (
                    <div key={s.id} onPointerDown={(e) => { e.stopPropagation(); select({ kind: "segment", id: s.id }); seek(s.start); }}
                      className={`absolute top-1 bottom-1 overflow-hidden rounded-sm bg-lane-zoom/70 px-1 text-[10px] text-primary-foreground ${isSel("segment", s.id) ? "ring-2 ring-ring" : ""}`}
                      style={{ left: (segPos[s.id] ?? 0) * pps, width: Math.max(2, (s.end - s.start) * pps - 1) }}>
                      {z.who === "other" ? "otro" : "tú"} ×{z.from}→{z.to}
                    </div>
                  );
                })}
                {l.key.startsWith("sub") && subtitles.filter((s) => `sub${s.track}` === l.key).map((s) => {
                  const x = toX(s.start);
                  if (x == null) return null;
                  return (
                    <div key={s.id} onPointerDown={(e) => moveSub(e, s.id, "move")}
                      className={`absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-sm border bg-lane-sub/60 px-1 text-[10px] leading-8 text-foreground ${s.shout ? "border-destructive" : ""} ${isSel("subtitle", s.id) ? "ring-2 ring-ring" : ""}`}
                      style={{ left: x, width: Math.max(3, (s.end - s.start) * pps - 1) }} title={s.text}>
                      {s.text}
                      <span onPointerDown={(e) => moveSub(e, s.id, "start")} className="absolute inset-y-0 left-0 w-1 cursor-ew-resize" />
                      <span onPointerDown={(e) => moveSub(e, s.id, "end")} className="absolute inset-y-0 right-0 w-1 cursor-ew-resize" />
                    </div>
                  );
                })}
                {l.key === "sfx" && sfx.map((f) => {
                  const x = toX(f.at);
                  if (x == null) return null;
                  return (
                    <div key={f.id} onPointerDown={(e) => { e.stopPropagation(); select({ kind: "sfx", id: f.id }); }}
                      className={`absolute top-1 bottom-1 w-16 overflow-hidden rounded-sm bg-lane-sfx/70 px-1 text-[10px] leading-8 text-primary-foreground ${isSel("sfx", f.id) ? "ring-2 ring-ring" : ""}`}
                      style={{ left: x }}>
                      ♪ {f.name}
                    </div>
                  );
                })}
              </div>
            ))}
            {playX != null && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-playhead" style={{ left: playX }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
