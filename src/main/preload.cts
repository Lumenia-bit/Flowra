import { contextBridge, ipcRenderer } from 'electron'
import type { BotApi, Broadcast, RuntimeLog } from '../shared/types.js'

const api: BotApi = {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: input => ipcRenderer.invoke('projects:create', input),
    update: input => ipcRenderer.invoke('projects:update', input),
    remove: id => ipcRenderer.invoke('projects:remove', id),
    duplicate: id => ipcRenderer.invoke('projects:duplicate', id)
  },
  assets: {
    choose: (projectId, kind) => ipcRenderer.invoke('assets:choose', projectId, kind),
    inspect: (projectId, path) => ipcRenderer.invoke('assets:inspect', projectId, path),
    unused: projectId => ipcRenderer.invoke('assets:unused', projectId),
    cleanup: projectId => ipcRenderer.invoke('assets:cleanup', projectId)
  },
  runtime: {
    start: projectId => ipcRenderer.invoke('runtime:start', projectId),
    stop: projectId => ipcRenderer.invoke('runtime:stop', projectId),
    status: projectId => ipcRenderer.invoke('runtime:status', projectId),
    onLog: callback => {
      const listener = (_event: Electron.IpcRendererEvent, log: RuntimeLog) => callback(log)
      ipcRenderer.on('runtime:log', listener)
      return () => ipcRenderer.removeListener('runtime:log', listener)
    },
    onStatus: callback => {
      const listener = (_event: Electron.IpcRendererEvent, value: { projectId: string; status: string }) => callback(value)
      ipcRenderer.on('runtime:status', listener)
      return () => ipcRenderer.removeListener('runtime:status', listener)
    }
  },
  users: {
    list: query => ipcRenderer.invoke('users:list', query),
    get: (projectId, userId) => ipcRenderer.invoke('users:get', projectId, userId),
    count: (projectId, filters) => ipcRenderer.invoke('users:count', projectId, filters)
  },
  broadcasts: {
    list: projectId => ipcRenderer.invoke('broadcasts:list', projectId),
    create: input => ipcRenderer.invoke('broadcasts:create', input),
    start: id => ipcRenderer.invoke('broadcasts:start', id),
    stop: id => ipcRenderer.invoke('broadcasts:stop', id),
    onProgress: callback => {
      const listener = (_event: Electron.IpcRendererEvent, value: Broadcast) => callback(value)
      ipcRenderer.on('broadcast:progress', listener)
      return () => ipcRenderer.removeListener('broadcast:progress', listener)
    }
  },
  export: {
    bot: (projectId, target) => ipcRenderer.invoke('export:bot', projectId, target)
  },
  system: {
    appVersion: () => ipcRenderer.invoke('system:version')
  }
}

contextBridge.exposeInMainWorld('flowra', api)
