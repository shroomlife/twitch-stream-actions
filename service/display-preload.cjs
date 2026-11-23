const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('reactionCamera',{visible:(id,until,local)=>ipcRenderer.send('reaction-visible',{id,until,local})})
