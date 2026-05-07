import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("floatodo", {
  loadData: () => ipcRenderer.invoke("data:load"),
  saveData: (data: unknown) => ipcRenderer.invoke("data:save", data),
  compactWindow: () => ipcRenderer.invoke("window:compact"),
  expandWindow: () => ipcRenderer.invoke("window:expanded"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke("window:setAlwaysOnTop", value),
  isAlwaysOnTop: () => ipcRenderer.invoke("window:isAlwaysOnTop"),
  showDogWindow: () => ipcRenderer.invoke("dog:show"),
  setDogAlwaysOnTop: (value: boolean) => ipcRenderer.invoke("dog:setAlwaysOnTop", value),
  sendDogReward: (payload: unknown) => ipcRenderer.invoke("dog:reward", payload),
  onDogReward: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("dog:reward", listener);
    return () => ipcRenderer.removeListener("dog:reward", listener);
  },
  sendDogState: (payload: unknown) => ipcRenderer.invoke("dog:state", payload),
  onDogState: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("dog:state", listener);
    return () => ipcRenderer.removeListener("dog:state", listener);
  },
  requestDeepSeekReview: (payload: unknown) => ipcRenderer.invoke("deepseek:review", payload),
  openDataFolder: () => ipcRenderer.invoke("app:openDataFolder")
});
