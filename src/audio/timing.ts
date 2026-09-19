import { STEPS, type Pattern, type TrackId } from '../model'

export function cycleFrames(bpm: number, sampleRate: number): number {
  return Math.round((480 / bpm) * sampleRate)
}
export function stepTime(step: number, frames: number, sampleRate: number): number {
  return Math.round((step * frames) / STEPS) / sampleRate
}
export function nextBoundary(now: number, start: number, duration: number): number {
  return start + Math.max(1, Math.ceil((now + 0.04 - start) / duration)) * duration
}
export function nextHatChoke(pattern: Pattern, step: number): number | null {
  for (let distance = 0; distance <= STEPS; distance++) {
    const index = (step + distance) % STEPS
    if (pattern.tracks.closedHat[index] || (distance > 0 && pattern.tracks.openHat[index])) return distance
  }
  return null
}
export function audioSignature(pattern: Pattern, bpm: number): string {
  return JSON.stringify([bpm, pattern.tracks])
}
export type SampleBank = Record<TrackId, AudioBuffer[]>
