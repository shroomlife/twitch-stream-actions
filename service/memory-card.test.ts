import {expect,test} from 'bun:test'
import {pngPlan,pngSizes,stripPlan,type PngStep,type Rect} from '../src/memory-card'

const inside=(rect:Rect,[width,height]:readonly [number,number])=>rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height

test('the animated strip cycles through all three frames, each at its own turn',()=>{
  const plan=stripPlan({key:'k',frames:3,media:'26tPplGWjN0xLybiU'})
  expect(plan.frames).toEqual([1,2,3])
  expect(plan.cycleMs).toBe(2400)
  // Negative delays: frame n is visible during [(n-1)·800, n·800) of every cycle from the first paint on.
  expect(plan.delays.map(delay=>((-delay%plan.cycleMs)+plan.cycleMs)%plan.cycleMs)).toEqual([0,1600,800])
  expect(plan.giphyMark).toBe(true)
  expect(stripPlan({key:'k',frames:1,media:'pilz-wave'})).toMatchObject({frames:[1],giphyMark:false})
  expect(stripPlan({key:'k',frames:1,media:null})).toMatchObject({frames:[1],giphyMark:false})
})

test('the PNG shows frame 1, a still of the GIPHY and the GIPHY mark inside the picture',()=>{
  for(const format of ['square','portrait','story'] as const){
    const size=pngSizes[format]
    const steps=pngPlan({key:'k',frames:3,media:'26tPplGWjN0xLybiU'},format,{width:480,height:270,giphy:true,creator:'someone'},'23.11.2026')
    const photos=steps.filter((step):step is Extract<PngStep,{draw:'photo'}>=>step.draw==='photo')
    const motif=steps.find((step):step is Extract<PngStep,{draw:'motif'}>=>step.draw==='motif')
    const mark=steps.find((step):step is Extract<PngStep,{draw:'mark'}>=>step.draw==='mark')
    expect(photos.map(photo=>photo.frame)).toEqual([1])
    expect(motif?.source).toBe('still')
    expect(steps.some(step=>step.draw==='creator'&&step.text==='GIF: @someone')).toBe(true)
    if(!motif||!mark)throw Error('motif and mark expected')
    for(const rect of [photos[0].rect,motif.rect,mark.rect])expect(inside(rect,size)).toBe(true)
    // The mark sits right under the GIPHY and never covers the photo or the GIF itself.
    expect(overlaps(mark.rect,photos[0].rect)||overlaps(mark.rect,motif.rect)).toBe(false)
    expect(mark.rect.y-(motif.rect.y+motif.rect.height)).toBeLessThan(size[0]*0.2)
    expect(mark.logo.width/mark.logo.height).toBeCloseTo(641/85,1)
  }
})

test('a mushroom PNG has the same strip photo and motif but no GIPHY mark',()=>{
  const steps=pngPlan({key:'k',frames:3,media:'pilz-wave'},'square',{width:512,height:512,giphy:false,creator:null},'23.11.2026')
  expect(steps.map(step=>step.draw)).toEqual(['ground','photo','motif','label'])
})
