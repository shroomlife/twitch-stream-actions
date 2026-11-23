import {expect,test} from 'bun:test'
import {inspectCamera,jpegFormat,captureCamera} from './camera-source'

function fixture(){
  const state={active:true,scene:'talk',device:'cam1',uuid:'source1',formats:['jpeg'],photos:0}
  const obs={async call(name:string,args?:Record<string,unknown>){
    switch(name){
      case 'GetVersion':return {supportedImageFormats:state.formats}
      case 'GetInputList':return {inputs:[{inputUuid:state.uuid,inputName:'Webcam'}]}
      case 'GetInputSettings':return {inputSettings:{video_device_id:state.device}}
      case 'GetInputPropertiesListPropertyItems':return {propertyItems:[{itemValue:state.device,itemEnabled:true,itemName:'StreamCam'}]}
      case 'GetCurrentProgramScene':return {currentProgramSceneUuid:state.scene}
      case 'GetSourceActive':return {videoActive:state.active}
      case 'GetSourceScreenshot':
        expect(args?.sourceUuid).toBe(state.uuid)
        expect(args?.imageFormat).toBe('jpeg')
        state.photos++
        return {imageData:'data:image/jpeg;base64,/9j/2Q=='}
      default:throw Error(name)
    }
  }}
  return {obs,state}
}
test('capture checks the same active source, scene and hardware immediately before the shutter',async()=>{
  for(const change of [{active:false},{scene:'desktop'},{uuid:'source2'},{device:'cam2'}]){
    const {obs,state}=fixture()
    const camera=await inspectCamera(obs)
    Object.assign(state,change)
    await expect(captureCamera(obs,camera,'jpeg',Date.now()+1000)).rejects.toThrow()
    expect(state.photos).toBe(0)
  }
})
test('negotiates JPEG and reads the camera source by UUID',async()=>{
  const {obs,state}=fixture()
  expect((await captureCamera(obs,await inspectCamera(obs),await jpegFormat(obs),Date.now()+5000)).length).toBe(4)
  state.formats=['png']
  await expect(jpegFormat(obs)).rejects.toThrow('JPEG')
})
