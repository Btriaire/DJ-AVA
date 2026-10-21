const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("djsynthNative", {
  memory: () => ipcRenderer.invoke("djsynth:memory"),
  trim: () => ipcRenderer.invoke("djsynth:trim")
});
