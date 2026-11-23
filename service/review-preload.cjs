const {ipcRenderer}=require('electron')
ipcRenderer.once('submission',(_,item)=>{
 document.querySelector('small').textContent=item.reason
 document.querySelector('b').textContent=item.author
 document.querySelector('p').textContent=item.message
 const img=document.querySelector('#motif');img.alt=item.title;if(item.preview)img.src=item.preview
 document.querySelector('#yes').onclick=()=>ipcRenderer.send('decision',true)
 document.querySelector('#no').onclick=()=>ipcRenderer.send('decision',false)
})
