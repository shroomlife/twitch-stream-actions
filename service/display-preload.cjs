const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('reactionCamera',{visible:(id,until,local,media)=>ipcRenderer.send('reaction-visible',{id,until,local,media})})
