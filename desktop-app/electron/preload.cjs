const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("autocut", {
  pickVideo: () => ipcRenderer.invoke("video:pick"),
  probe: (p) => ipcRenderer.invoke("video:probe", p),
  analyze: (p) => ipcRenderer.invoke("project:analyze", p),
  transcribe: (asr, levels, tracks) => ipcRenderer.invoke("project:transcribe", asr, levels, tracks),
  onProgress: (cb) => {
    const h = (_e, msg) => cb(msg);
    ipcRenderer.on("analyze:progress", h);
    return () => ipcRenderer.removeListener("analyze:progress", h);
  },
  openFolder: (p) => ipcRenderer.invoke("folder:open", p),
  saveText: (p, c) => ipcRenderer.invoke("file:saveText", p, c),
});
