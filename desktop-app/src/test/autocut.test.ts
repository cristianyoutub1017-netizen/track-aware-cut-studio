import { describe, expect, it } from "vitest";
import { computeKeepSegments, sourceToTimeline } from "@/lib/autocut/core";
import { DEFAULT_SETTINGS } from "@/lib/autocut/store";
import { buildSubtitles, chunkWords } from "@/lib/autocut/subtitles";
import type { Word } from "@/lib/autocut/types";

const w = (text: string, start: number, track: 1 | 2 | 3 | 4 = 1, db = -25): Word => ({ text, start, end: start + 0.3, track, db });

describe("colores de pista", () => {
  it("micro blanco, juego amarillo, discord rojo, pista 4 naranja", () => {
    expect(DEFAULT_SETTINGS.trackColors).toEqual({ 1: "#ffffff", 2: "#ffd400", 3: "#ff2020", 4: "#ff8c00" });
  });
  it("pista 4 desmarcada por defecto", () => {
    expect(DEFAULT_SETTINGS.trackEnabled[4]).toBe(false);
    expect(DEFAULT_SETTINGS.trackEnabled[1] && DEFAULT_SETTINGS.trackEnabled[2] && DEFAULT_SETTINGS.trackEnabled[3]).toBe(true);
  });
  it("la plantilla por defecto usa Impact", async () => {
    const { BUILT_IN_TEMPLATES } = await import("@/lib/autocut/subtitles");
    expect(BUILT_IN_TEMPLATES.find((t) => t.id === DEFAULT_SETTINGS.defaultTemplate)?.font).toBe("Impact");
  });
});

describe("agrupar palabras", () => {
  const words = [w("uno", 0), w("dos", 0.32), w("tres", 0.64), w("cuatro", 0.96), w("cinco", 1.28)];
  it("de 2 en 2", () => {
    expect(chunkWords(words, 2, [], -12).map((g) => g.length)).toEqual([2, 2, 1]);
  });
  it("palabra a palabra", () => {
    expect(chunkWords(words, 1, [], -12)).toHaveLength(5);
  });
  it("un tramo concreto puede ir de 3 en 3", () => {
    expect(chunkWords(words, 1, [{ id: "o", start: 0, end: 0.7, size: 3 }], -12)[0]).toHaveLength(3);
  });
  it("en dinámico un grito va en su propio subtítulo", () => {
    const g = chunkWords([w("hola", 0), w("tío", 0.32), w("CORRE", 0.64, 1, -5)], "auto", [], -12);
    expect(g.map((x) => x.map((y) => y.text).join(" "))).toEqual(["hola tío", "CORRE"]);
  });
});

describe("plantilla de grito", () => {
  it("usa la plantilla de grito y acerca la cámara", () => {
    const subs = buildSubtitles([w("AAAH", 1, 1, -3)], [{ id: "s", start: 0, end: 5 }], DEFAULT_SETTINGS, []);
    expect(subs[0]?.templateId).toBe("grito");
    expect(subs[0]?.punch).toBe(true);
  });
});

describe("tiempos exactos para Vegas", () => {
  const segs = [{ id: "a", start: 2, end: 5 }, { id: "b", start: 10, end: 12 }];
  it("un subtítulo en 11 s del original cae en 4 s del proyecto", () => {
    expect(sourceToTimeline(11, segs)).toBe(4);
  });
  it("lo que está en un corte no aparece", () => {
    expect(sourceToTimeline(7, segs)).toBeNull();
  });
  it("silencios más largos que el mínimo se cortan", () => {
    const s = computeKeepSegments([[1, 2], [5, 6]], 10, { ...DEFAULT_SETTINGS, padBefore: 0, padAfter: 0 });
    expect(s.map((x) => [x.start, x.end])).toEqual([[1, 2], [5, 6]]);
  });
});
