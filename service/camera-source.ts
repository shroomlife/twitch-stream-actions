type Obs = { call(name:string, args?:Record<string,unknown>):Promise<any> }
export class CameraProblem extends Error {}

export async function jpegFormat(obs:Obs):Promise<string> {
  const {supportedImageFormats} = await obs.call('GetVersion')
  const format = supportedImageFormats?.find((f:string)=>['jpg','jpeg'].includes(f.toLowerCase()))
  if (!format) throw new CameraProblem('OBS unterstützt keine JPEG-Aufnahmen.')
  return format
}

export async function inspectCamera(obs:Obs) {
  const {inputs} = await obs.call('GetInputList',{inputKind:'dshow_input'})
  const source = inputs.find((input:{inputName:string})=>input.inputName==='Webcam')
  if (!source?.inputUuid) throw new CameraProblem('Die Kameraquelle „Webcam“ fehlt in OBS.')
  const input = {inputUuid:source.inputUuid}
  const {inputSettings} = await obs.call('GetInputSettings',input)
  const {propertyItems} = await obs.call('GetInputPropertiesListPropertyItems',{...input,propertyName:'video_device_id'})
  const device = propertyItems.find((item:{itemValue:string;itemEnabled:boolean})=>item.itemEnabled && item.itemValue===inputSettings.video_device_id)
  if (!device) throw new CameraProblem('Das Gerät der OBS-Quelle „Webcam“ ist nicht verfügbar.')
  const {currentProgramSceneUuid:scene} = await obs.call('GetCurrentProgramScene')
  const {videoActive} = await obs.call('GetSourceActive',{sourceUuid:source.inputUuid})
  if (!videoActive) throw new CameraProblem('OBS ist verbunden. Die Quelle „Webcam“ ist im Programm inaktiv.')
  return {uuid:String(source.inputUuid),scene:String(scene),device:String(device.itemValue),name:String(device.itemName)}
}

export async function captureCamera(obs:Obs, expected:Awaited<ReturnType<typeof inspectCamera>>,format:string,deadline:number) {
  async function confirm(){
    const now=await inspectCamera(obs)
    if (Date.now()>=deadline || now.uuid!==expected.uuid || now.device!==expected.device || now.scene!==expected.scene)
      throw new CameraProblem('Die Einblendung, Kamera oder Szene hat sich geändert.')
  }
  await confirm()
  const {imageData}=await obs.call('GetSourceScreenshot',{sourceUuid:expected.uuid,imageFormat:format,imageWidth:1280,imageCompressionQuality:90})
  await confirm()
  const prefix=/^data:image\/jpe?g;base64,/i.exec(imageData)
  if(!prefix) throw new CameraProblem('OBS hat kein JPEG geliefert.')
  return Buffer.from(imageData.slice(prefix[0].length),'base64')
}
