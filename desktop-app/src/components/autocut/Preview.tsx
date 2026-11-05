import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/autocut/store";
import { usePlayer, viewAt } from "@/lib/autocut/player";
import { cssFilter } from "@/lib/autocut/media";
import { editedDuration, fmt, sourceToTimeline } from "@/lib/autocut/core";
import { SubtitleView } from "./SubtitleView";
import { OTHERS_LIFT } from "@/lib/autocut/vegas";
import { subLane, type TrackNo } from "@/lib/autocut/types";

// URL para que el programa sirva un archivo del PC (mismo servidor que el vídeo).
const mediaUrl = (videoUrl: string, file: string) => {
  try { return `${new URL(videoUrl).origin}/__media?p=${encodeURIComponent(file)}`; } catch { return ""; }
};

export function Preview() {
  const { videoUrl, segments, zooms, subtitles, templates, settings, color, width, height, analysis } = useEditor();
  const { time, playing, setVideo, setTime, setPlaying, seek, muted } = usePlayer();
  const audios = useRef<Partial<Record<TrackNo, HTMLAudioElement | null>>>({});
  const trackFiles = videoUrl?.startsWith("http") ? Object.entries(analysis?.trackFiles ?? {}) : [];
  const multi = trackFiles.length > 0;
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });
  const stageH = size.h;

  useEffect(() => {
    setVideo(ref.current);
    return () => setVideo(null);
  }, [videoUrl, setVideo]);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.min(el.clientWidth, (el.clientHeight * 16) / 9);
      setSize({ w, h: (w * 9) / 16 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reproducción saltando los trozos cortados
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = ref.current;
      if (v) {
        let t = v.currentTime;
        if (!v.paused && segments.length) {
          const inSeg = segments.find((s) => t >= s.start && t < s.end);
          if (!inSeg) {
            const next = segments.find((s) => s.start > t);
            if (next) { v.currentTime = next.start; t = next.start; }
            else { v.pause(); setPlaying(false); }
          }
        }
        setTime(t);
        // Las pistas separadas suenan sincronizadas con el vídeo.
        for (const a of Object.values(audios.current)) {
          if (!a) continue;
          if (Math.abs(a.currentTime - t) > 0.15) a.currentTime = t;
          if (v.paused && !a.paused) a.pause();
          else if (!v.paused && a.paused) a.play().catch(() => {});
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [segments, setTime, setPlaying]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      if (segments.length && !segments.some((s) => v.currentTime >= s.start && v.currentTime < s.end)) {
        const next = segments.find((s) => s.start > v.currentTime) ?? segments[0];
        if (next) v.currentTime = next.start;
      }
      v.play(); setPlaying(true);
    } else { v.pause(); setPlaying(false); }
  };

  const view = viewAt(time, segments, zooms, subtitles, width, height);
  const active = subtitles.filter((s) => time >= s.start && time <= s.end);
  const tpl = (id: string) => (templates.find((t) => t.id === id) ?? templates[0])!;
  const edited = sourceToTimeline(time, segments);

  return (
    <div className="flex h-full flex-col gap-2">
      <div ref={outer} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-stage">
        <div ref={box} className="relative overflow-hidden" style={{ width: size.w, height: size.h }}>
          {videoUrl ? (
            <video
              ref={ref}
              src={videoUrl}
              className="absolute inset-0 h-full w-full"
              style={{ transformOrigin: "0 0", transform: `scale(${view.zoom}) translate(${-view.tx}%, ${-view.ty}%)`, filter: cssFilter(color) }}
              onClick={toggle}
              muted={multi}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Abre una grabación para empezar</div>
          )}
          {trackFiles.map(([k, f]) => (
            <audio key={k} ref={(el) => { audios.current[+k as TrackNo] = el; }} src={mediaUrl(videoUrl!, f)} preload="auto" muted={muted[+k as TrackNo]} />
          ))}
          {active.map((s) => (
            <SubtitleView key={s.id} lift={subLane(s.track) === "otros" ? OTHERS_LIFT : 0} animKey={s.id} template={tpl(s.templateId)} color={tpl(s.templateId).useTrackColor ? settings.trackColors[s.track] : tpl(s.templateId).fill} text={s.text} stageHeight={stageH} duration={s.end - s.start} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="secondary" onClick={() => seek(segments[0]?.start ?? 0)} aria-label="Al inicio"><SkipBack /></Button>
        <Button size="icon" onClick={toggle} aria-label={playing ? "Pausa" : "Reproducir"}>{playing ? <Pause /> : <Play />}</Button>
        <span className="font-mono text-xs text-muted-foreground">
          Editado {edited == null ? "— (en un corte)" : fmt(edited)} / {fmt(editedDuration(segments))} · Original {fmt(time)}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">Zoom ×{view.zoom.toFixed(2)}</span>
      </div>
    </div>
  );
}
