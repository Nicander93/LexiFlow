import { contextBridge, ipcRenderer } from "electron";
const IPC_CHANNELS = {
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  providerHealth: "provider:health",
  providerModels: "provider:models",
  translationStart: "translation:start",
  translationCancel: "translation:cancel",
  translationEvent: "translation:event",
  selectionCapture: "selection:capture",
  historyList: "history:list",
  historyDelete: "history:delete",
  historyClear: "history:clear",
  clipboardWrite: "clipboard:write",
  windowOpenMain: "window:open-main",
  popupPayload: "popup:payload",
  popupClose: "popup:close",
  popupPin: "popup:pin"
};
const on = (channel, listener) => {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
const api = {
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (settings) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, settings)
  },
  provider: {
    healthCheck: () => ipcRenderer.invoke(IPC_CHANNELS.providerHealth),
    getModels: () => ipcRenderer.invoke(IPC_CHANNELS.providerModels)
  },
  translation: {
    start: (request) => ipcRenderer.invoke(IPC_CHANNELS.translationStart, request),
    cancel: (requestId) => ipcRenderer.send(IPC_CHANNELS.translationCancel, requestId),
    onEvent: (listener) => on(IPC_CHANNELS.translationEvent, listener)
  },
  selection: {
    capture: () => ipcRenderer.invoke(IPC_CHANNELS.selectionCapture)
  },
  history: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.historyList),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.historyDelete, id),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.historyClear)
  },
  clipboard: {
    writeText: (text) => ipcRenderer.invoke(IPC_CHANNELS.clipboardWrite, text)
  },
  window: {
    openMain: (route) => ipcRenderer.send(IPC_CHANNELS.windowOpenMain, route),
    closePopup: () => ipcRenderer.send(IPC_CHANNELS.popupClose),
    pinPopup: (pinned) => ipcRenderer.send(IPC_CHANNELS.popupPin, pinned),
    onPopupPayload: (listener) => on(IPC_CHANNELS.popupPayload, listener),
    onNavigate: (listener) => on("navigation:open", listener)
  }
};
contextBridge.exposeInMainWorld("translator", api);
