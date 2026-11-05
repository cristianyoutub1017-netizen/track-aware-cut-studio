# AutoCut GTA - transcriptor interno (lo lanza el programa automáticamente).
# No hace falta ejecutarlo a mano: el botón "Analizar y crear proyecto" separa
# las pistas de audio con ffmpeg y llama a este script con cada .wav.
#
# Requisito (una vez): pip install faster-whisper
# Uso interno: python autocut_analizar.py --salida palabras.json 1=pista1.wav 2=pista2.wav ...
import argparse, json, sys

p = argparse.ArgumentParser()
p.add_argument("pistas", nargs="+", help="N=ruta.wav")
p.add_argument("--salida", required=True)
p.add_argument("--modelo", default="large-v3")
p.add_argument("--gpu", default="0")
a = p.parse_args()

import os, glob
# Windows: las librerías de CUDA instaladas por pip (nvidia-cublas/cudnn) hay que añadirlas a mano.
if os.name == "nt":
    import site
    for sp in site.getsitepackages() + [site.getusersitepackages()]:
        for d in glob.glob(os.path.join(sp, "nvidia", "*", "bin")):
            os.add_dll_directory(d)
            os.environ["PATH"] = d + os.pathsep + os.environ["PATH"]

# faster-whisper importa PyAV (av) al arrancar, pero aquí no lo usamos: el audio ya llega
# preparado por el programa. En algunos Windows/Python el DLL de av no carga, así que si
# falla lo sustituimos por un módulo vacío.
try:
    import av  # noqa: F401
except Exception as e:
    import types
    print(f"PyAV no disponible ({type(e).__name__}); no hace falta, sigo sin él", flush=True)
    sys.modules["av"] = types.ModuleType("av")

from faster_whisper import WhisperModel

print("Cargando el modelo de voz (la primera vez se descarga, unos 3 GB)…", flush=True)
try:
    model = WhisperModel(a.modelo, device="cuda", device_index=int(a.gpu), compute_type="float16")
    print("Usando la GPU")
except Exception as e:  # sin GPU compatible: CPU (más lento)
    print(f"GPU no disponible ({e}); usando CPU")
    model = WhisperModel("small", device="cpu", compute_type="int8")

import wave
import numpy as np

def load(path):  # WAV mono 16 kHz que prepara el programa (sin depender de PyAV)
    with wave.open(path, "rb") as f:
        return np.frombuffer(f.readframes(f.getnframes()), np.int16).astype(np.float32) / 32768.0

words = []
for item in a.pistas:
    no, wav = item.split("=", 1)
    t = int(no)
    audio = load(wav)
    dur = max(1.0, len(audio) / 16000)
    print(f"Pista {t}: transcribiendo…")
    print(f"PROGRESO {t} 0", flush=True)
    try:
        segs, _ = model.transcribe(audio, language="es", word_timestamps=True, vad_filter=True, beam_size=5)
        for s in segs:
            for w in s.words or []:
                words.append({"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "track": t})
            print(f"Pista {t}: {s.start:7.1f}s  {s.text.strip()[:60]}")
            print(f"PROGRESO {t} {min(100, int(s.end / dur * 100))}", flush=True)
    except RuntimeError as e:  # p. ej. falta una DLL de CUDA al empezar: repetir en CPU
        if "cuda" not in str(e).lower() and "cublas" not in str(e).lower() and "cudnn" not in str(e).lower():
            raise
        print(f"Fallo de GPU ({e}); repitiendo en CPU")
        model = WhisperModel("small", device="cpu", compute_type="int8")
        segs, _ = model.transcribe(audio, language="es", word_timestamps=True, vad_filter=True, beam_size=5)
        for s in segs:
            for w in s.words or []:
                words.append({"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "track": t})

with open(a.salida, "w", encoding="utf-8") as f:
    json.dump(words, f, ensure_ascii=False)
print(f"Transcripción lista: {len(words)} palabras")
