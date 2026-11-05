import type { SubTemplate } from "@/lib/autocut/types";

interface Props {
  template: SubTemplate;
  color: string;
  text: string;
  stageHeight: number;
  duration?: number;
  animKey?: string | number;
  /** Subir el texto (fracción de la altura) para que no pise otra pista. */
  lift?: number;
}

// Subtítulo tal y como se verá (Impact, color de pista, contorno y animación).
export function SubtitleView({ template: t, color, text, stageHeight, duration = 1, animKey, lift = 0 }: Props) {
  const fontSize = (t.size / 100) * stageHeight;
  const stroke = ((t.strokeWidth * 2) / 1080) * stageHeight;
  const pos = t.position === "bottom" ? "bottom-[10%]" : t.position === "top" ? "top-[10%]" : "top-1/2 -translate-y-1/2";
  return (
    <div className={`pointer-events-none absolute inset-x-0 flex justify-center ${pos}`} style={lift ? { transform: `translateY(${-lift * 100}%)`, marginTop: 0 } : undefined}>
      <span
        key={animKey}
        className={`sub-text anim-${t.animation}`}
        style={{
          fontFamily: `${t.font}, Impact, Anton, sans-serif`,
          fontSize,
          color,
          WebkitTextStroke: `${stroke}px ${t.stroke}`,
          ["--dur" as string]: `${duration}s`,
        }}
      >
        {t.uppercase ? text.toUpperCase() : text}
      </span>
    </div>
  );
}
