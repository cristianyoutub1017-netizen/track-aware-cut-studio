// AutoCut GTA Editor - programa de escritorio para Windows.
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn, execFile } = require("child_process");

app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");

const ROOT = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
const WEB = app.isPackaged ? path.join(process.resourcesPath, "web") : path.join(__dirname, "..", "dist", "client");
const BIN = path.join(ROOT, "bin");
const exe = (n) => {
  const local = path.join(BIN, n + (process.platform === "win32" ? ".exe" : ""));
  return fs.existsSync(local) ? local : n;
};
const PORT = 47123; // fijo para que los ajustes y plantillas se guarden siempre

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2", ".py": "text/plain", ".txt": "text/plain" };
const VMIME = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".mkv": "video/x-matroska", ".webm": "video/webm", ".wav": "audio/wav" };

function serveMedia(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err) { res.writeHead(404); return res.end(); }
    const type = VMIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      const start = range[1] ? +range[1] : 0;
      const end = range[2] ? Math.min(+range[2], st.size - 1) : Math.min(start + 32 * 1024 * 1024, st.size - 1);
      res.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": st.size });
      fs.createReadStream(file).pipe(res);
    }
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (u.pathname === "/__media") return serveMedia(req, res, u.searchParams.get("p") || "");
  let f = path.normalize(path.join(WEB, decodeURIComponent(u.pathname)));
  if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(WEB, "_shell.html");
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 1000, backgroundColor: "#15171c", title: "AutoCut GTA Editor", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required" },
  });
  win.maximize();
  win.loadURL(`http://127.0.0.1:${PORT}/`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

app.whenReady().then(() => {
  server.listen(PORT, "127.0.0.1", createWindow);
  server.on("error", (e) => { dialog.showErrorBox("AutoCut GTA", "No se pudo iniciar (¿ya está abierto?): " + e.message); app.quit(); });
});
app.on("window-all-closed", () => app.quit());

ipcMain.handle("video:pick", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Vídeo", extensions: ["mp4", "mkv", "mov"] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { path: p, name: path.basename(p), url: `http://127.0.0.1:${PORT}/__media?p=${encodeURIComponent(p)}` };
});

ipcMain.handle("video:probe", (_e, file) => new Promise((res, rej) => {
  execFile(exe("ffprobe"), ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { maxBuffer: 1 << 24 }, (err, out) => {
    if (err) return rej(err.message);
    const j = JSON.parse(out);
    const v = j.streams.find((s) => s.codec_type === "video");
    const [n, d] = (v.avg_frame_rate || "60/1").split("/").map(Number);
    res({ duration: +j.format.duration, width: v.width, height: v.height, fps: n / (d || 1), audioCount: j.streams.filter((s) => s.codec_type === "audio").length });
  });
}));

// "Analizar y crear proyecto": todo automático a partir del vídeo, sin archivos externos.
// 1) ffprobe detecta las pistas de audio (y sus nombres de OBS si los hay).
// 2) Una sola lectura con ffmpeg separa cada pista en un .wav y mide su volumen.
// 3) faster-whisper transcribe cada .wav (si Python está instalado).
function probeFile(file) {
  return new Promise((res, rej) => {
    execFile(exe("ffprobe"), ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { maxBuffer: 1 << 24 }, (err, out) => {
      if (err) return rej(err.message);
      res(JSON.parse(out));
    });
  });
}

function splitTracks(file, tracks, dir, duration, onProgress) {
  return new Promise((resolve, reject) => {
    const args = ["-v", "error", "-nostdin", "-y", "-threads", "8", "-progress", "pipe:1", "-i", file];
    tracks.forEach((t) => args.push("-map", `0:a:${t.no - 1}`, "-vn", "-c:a", "pcm_s16le", t.wav));
    // Copia ligera (mono 16 kHz) para el transcriptor, en la carpeta temporal.
    tracks.forEach((t) => args.push("-map", `0:a:${t.no - 1}`, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", t.asr));
    tracks.forEach((_t, i) => args.push("-map", `0:a:${_t.no - 1}`, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", `pipe:${i + 3}`));
    const stdio = ["ignore", "pipe", "pipe", ...tracks.map(() => "pipe")];
    const proc = spawn(exe("ffmpeg"), args, { stdio, windowsHide: true });
    const meters = tracks.map(() => ({ levels: [], sum: 0, count: 0, rest: Buffer.alloc(0) }));
    tracks.forEach((_t, i) => {
      proc.stdio[i + 3].on("data", (chunk) => {
        const m = meters[i];
        const buf = m.rest.length ? Buffer.concat([m.rest, chunk]) : chunk;
        const end = buf.length - (buf.length % 4);
        for (let k = 0; k < end; k += 4) {
          const v = buf.readFloatLE(k);
          m.sum += v * v;
          if (++m.count === 400) { m.levels.push(Math.round(100 * Math.log10(m.sum / 400 + 1e-12)) / 10); m.sum = 0; m.count = 0; }
        }
        m.rest = Buffer.from(buf.subarray(end));
      });
    });
    proc.stdout.on("data", (d) => {
      const m = /out_time_us=(\d+)/.exec(d.toString());
      if (m && duration) onProgress(Math.min(99, Math.round((+m[1] / 1e6 / duration) * 100)));
    });
    let err = "";
    proc.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    proc.on("error", (e) => reject("No encuentro ffmpeg: " + e.message));
    proc.on("close", (code) => {
      if (code !== 0) return reject(err || "ffmpeg terminó con error " + code);
      resolve(meters.map((m) => m.levels));
    });
  });
}

// Ejecuta un comando y va mandando cada línea al registro.
function run(cmd, args, log) {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: BIN + path.delimiter + process.env.PATH, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" };
    let proc;
    try { proc = spawn(cmd, args, { env, windowsHide: true }); } catch { return resolve({ code: -1, out: "" }); }
    let out = "";
    const onData = (d) => {
      const s = d.toString(); out = (out + s).slice(-6000);
      s.split(/\r?\n/).filter(Boolean).forEach(log);
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("error", () => resolve({ code: -1, out: "" }));
    proc.on("close", (code) => resolve({ code, out }));
  });
}

// Busca un Python que funcione (python, py -3, python3).
async function findPython() {
  const cands = process.platform === "win32" ? [["python", []], ["py", ["-3"]], ["python3", []]] : [["python3", []], ["python", []]];
  for (const [cmd, pre] of cands) {
    const r = await run(cmd, [...pre, "--version"], () => {});
    if (r.code === 0 && /Python 3/.test(r.out)) return { cmd, pre };
  }
  return null;
}

// Transcribe los .wav. Si falta faster-whisper, lo instala solo (una vez) y reintenta.
async function transcribeWavs(tracks, log) {
  const py = await findPython();
  if (!py) return { words: [], warning: "No encuentro Python en tu PC: el proyecto está hecho pero sin subtítulos. Instala Python 3.11 desde python.org (marca “Add python.exe to PATH”) y vuelve a analizar." };
  const script = path.join(WEB, "autocut_analizar.py");
  const outFile = path.join(app.getPath("temp"), `autocut_words_${Date.now()}.json`);
  const args = [...py.pre, script, "--salida", outFile, ...tracks.map((t) => `${t.no}=${t.asr}`)];
  let r = await run(py.cmd, args, log);
  if (r.code !== 0 && /No module named ['"]?(faster_whisper|ctranslate2|av)/.test(r.out)) {
    log("Instalando el transcriptor (solo la primera vez, puede tardar unos minutos)…");
    const pkgs = ["faster-whisper"];
    if (process.platform === "win32") pkgs.push("nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*");
    const inst = await run(py.cmd, [...py.pre, "-m", "pip", "install", "--upgrade", ...pkgs], (l) => log("pip: " + l));
    if (inst.code !== 0) return { words: [], warning: "No se pudo instalar el transcriptor automáticamente: " + inst.out.split("\n").slice(-3).join(" ") };
    log("Transcriptor instalado. Transcribiendo…");
    r = await run(py.cmd, args, log);
  }
  try {
    if (r.code !== 0 || !fs.existsSync(outFile)) throw new Error();
    const words = JSON.parse(fs.readFileSync(outFile, "utf8"));
    fs.unlinkSync(outFile);
    return { words };
  } catch {
    return { words: [], warning: "La transcripción falló (sin subtítulos): " + r.out.split("\n").slice(-4).join(" ") };
  }
}

ipcMain.handle("project:analyze", async (e, file) => {
  const send = (step, pct) => e.sender.send("analyze:progress", { step, pct });
  send("Detectando pistas de audio…", 0);
  const j = await probeFile(file);
  const v = j.streams.find((s) => s.codec_type === "video");
  if (!v) throw "El archivo no tiene vídeo";
  const [n, d] = (v.avg_frame_rate || "60/1").split("/").map(Number);
  const audio = j.streams.filter((s) => s.codec_type === "audio");
  if (!audio.length) throw "El vídeo no tiene pistas de audio";
  const duration = +j.format.duration;

  // Carpeta junto al vídeo: "partida_pistas/pista1_Micrófono.wav", etc. (máx. 4 pistas)
  const base = file.replace(/\.[^.\\/]+$/, "");
  const dir = base + "_pistas";
  fs.mkdirSync(dir, { recursive: true });
  const tracks = audio.slice(0, 4).map((s, i) => {
    const title = (s.tags && (s.tags.title || s.tags.name || s.tags.handler_name)) || "";
    const name = title && !/^(SoundHandler|Core Media Audio)$/i.test(title) ? title.trim() : "";
    const safe = (name || `pista${i + 1}`).replace(/[\\/:*?"<>|]/g, "_");
    return { no: i + 1, name, wav: path.join(dir, `pista${i + 1}_${safe}.wav`), asr: path.join(app.getPath("temp"), `autocut_asr_${Date.now()}_${i + 1}.wav`) };
  });

  send(`Separando ${tracks.length} pistas de audio…`, 0);
  const levels = await splitTracks(file, tracks, dir, duration, (p) => send(`Separando ${tracks.length} pistas de audio…`, p));

  const WIN = 0.05;
  return {
    analysis: {
      version: 1, video: path.basename(file), duration, width: v.width, height: v.height, fps: n / (d || 1),
      audioCount: audio.length, win: WIN,
      levels: Object.fromEntries(tracks.map((t, i) => [String(t.no), levels[i]])),
      trackNames: Object.fromEntries(tracks.filter((t) => t.name).map((t) => [String(t.no), t.name])),
      trackFiles: Object.fromEntries(tracks.map((t) => [String(t.no), t.wav])),
      words: [],
    },
    folder: dir,
    asr: Object.fromEntries(tracks.map((t) => [String(t.no), t.asr])),
  };
});

// Subtítulos en segundo plano: el proyecto (cortes, zoom, pistas) ya está hecho cuando esto empieza.
ipcMain.handle("project:transcribe", async (e, asr, levels, wanted) => {
  const logFile = path.join(app.getPath("userData"), "autocut_subtitulos.log");
  fs.writeFileSync(logFile, `AutoCut GTA - subtítulos ${new Date().toISOString()}\n`);
  const send = (step, pct = -1) => e.sender.send("analyze:progress", { step, pct });
  const tracks = wanted.filter((n) => asr[String(n)] && fs.existsSync(asr[String(n)])).map((n) => ({ no: n, asr: asr[String(n)] }));
  if (!tracks.length) return { words: [], warning: "No hay pistas para transcribir" };
  send("Subtítulos: preparando…");
  const order = tracks.map((t) => t.no);
  const { words, warning: w0 } = await transcribeWavs(tracks, (l) => {
    fs.appendFileSync(logFile, l + "\n");
    const m = /^PROGRESO (\d+) (\d+)/.exec(l);
    if (m) {
      const i = order.indexOf(+m[1]);
      return send(`Subtítulos: pista ${m[1]} (${i + 1}/${order.length})`, Math.round(((i + +m[2] / 100) / order.length) * 100));
    }
    send("Subtítulos: " + l.slice(0, 60));
  });
  let warning = w0;
  if (warning) warning += ` · Detalles en ${logFile}`;
  else if (!words.length) warning = `No se ha detectado voz en las pistas ${order.join(", ")}. Detalles en ${logFile}`;
  const WIN = 0.05;
  for (const w of words) {
    const lv = levels[String(w.track)] || [];
    const i0 = Math.floor(w.start / WIN), i1 = Math.max(i0 + 1, Math.floor(w.end / WIN));
    const slice = lv.slice(i0, i1);
    w.db = slice.length ? Math.max(...slice) : -60;
  }
  for (const a of Object.values(asr)) fs.rm(a, { force: true }, () => {});
  return { words, warning };
});

ipcMain.handle("file:saveText", async (_e, defaultPath, content) => {
  const r = await dialog.showSaveDialog(win, { defaultPath, filters: [{ name: "Archivo", extensions: [path.extname(defaultPath).slice(1) || "txt"] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, content, "utf8");
  shell.showItemInFolder(r.filePath);
  return r.filePath;
});

ipcMain.handle("folder:open", (_e, p) => shell.openPath(p));
