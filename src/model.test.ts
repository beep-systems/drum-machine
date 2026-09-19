import { describe, expect, it } from 'vitest'
import { editStep, emptyPattern, PRESETS, TRACKS } from './model'
import { cycleFrames, nextBoundary, nextHatChoke, stepTime } from './audio/timing'

describe('musical timing', () => {
  it('keeps eight quarter notes per cycle across the full BPM range', () => {
    for (const bpm of [40, 100, 137, 200, 300])
      for (const rate of [44100, 48000]) {
        const frames = cycleFrames(bpm, rate)
        expect(Math.abs(frames / rate - 480 / bpm)).toBeLessThanOrEqual(0.5 / rate)
        expect(stepTime(32, frames, rate)).toBe(frames / rate)
        expect(Math.abs(stepTime(4, frames, rate) - 60 / bpm)).toBeLessThan(1 / rate)
      }
  })
  it('schedules changes strictly on a future cycle boundary', () => {
    expect(nextBoundary(0.5, 0.1, 4.8)).toBeCloseTo(4.9)
    expect(nextBoundary(4.88, 0.1, 4.8)).toBeCloseTo(9.7)
    expect(nextBoundary(100, 0.1, 4.8)).toBeCloseTo(100.9)
  })
  it('finds hi-hat choke across the cycle seam and at the same step', () => {
    const pattern = emptyPattern('test')
    pattern.tracks.openHat[30] = 1
    pattern.tracks.closedHat[0] = 1
    expect(nextHatChoke(pattern, 30)).toBe(2)
    pattern.tracks.closedHat[30] = 1
    expect(nextHatChoke(pattern, 30)).toBe(0)
    expect(nextHatChoke(emptyPattern('empty'), 4)).toBeNull()
  })
  it('ships independent valid patterns and six distinct grooves', () => {
    expect(new Set(PRESETS.map((p) => JSON.stringify(p.pattern.tracks))).size).toBe(6)
    for (const preset of PRESETS)
      for (const track of TRACKS) expect(preset.pattern.tracks[track.id]).toHaveLength(32)
    expect(PRESETS[3].pattern.tracks.kick.every(Boolean)).toBe(true)
    const clone = structuredClone(PRESETS[0].pattern)
    clone.tracks.kick[0] = 0
    expect(PRESETS[0].pattern.tracks.kick[0]).toBe(2)
  })
  it('supports ordinary hits and reversible accents', () => {
    expect(editStep(0, false)).toBe(1)
    expect(editStep(2, false)).toBe(0)
    expect(editStep(0, true)).toBe(2)
    expect(editStep(1, true)).toBe(2)
    expect(editStep(2, true)).toBe(1)
  })
})
