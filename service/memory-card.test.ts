import {expect,test} from 'bun:test'
import {frameCacheKey,missingFrames,stripPlan} from '../src/memory-card'

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

test('a growing strip loads only the frames it does not have yet',()=>{
  const memory={key:'1795129200000-x',frames:2,media:null}
  expect(missingFrames(memory,new Set())).toEqual([1,2])
  const loaded=new Set([frameCacheKey(memory.key,1),frameCacheKey(memory.key,2)])
  expect(missingFrames({...memory,frames:3},loaded)).toEqual([3])
  expect(missingFrames(memory,loaded)).toEqual([])
})
