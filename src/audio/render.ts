import { TRACKS, type Pattern, type TrackId } from '../model'
import { cycleFrames, nextHatChoke, stepTime, type SampleBank } from './timing'

export type RenderedLoop = {
  buffers: Record<TrackId, AudioBuffer>
  loopStart: number
  loopDuration: number
  duration: number
}

export async function renderLoop(
  pattern: Pattern,
  bpm: number,
  bank: SampleBank,
  sampleRate: number,
  signal?: AbortSignal,
): Promise<RenderedLoop> {
  const frames = cycleFrames(bpm, sampleRate)
  const duration = frames / sampleRate
  const longest = Math.max(
    ...Object.values(bank)
      .flat()
      .map((b) => b.duration),
  )
  // Odd hit counts need two musical cycles to close the round-robin sequence.
  // Otherwise a kick tail at the seam could abruptly switch to a different recording.
  const period = TRACKS.some(
    (t) => bank[t.id].length === 2 && pattern.tracks[t.id].filter(Boolean).length % 2,
  )
    ? 2
    : 1
  const warmup = Math.max(period, Math.ceil(longest / duration / period) * period)
  const loopStart = warmup * duration
  // The first cycles contain the natural attack; the last is a steady-state loop.
  // Keeping a whole-cycle pre-roll lets cymbal tails cross the loop seam naturally.
  const pairs = [] as [TrackId, AudioBuffer][]
  for (const track of TRACKS) {
    signal?.throwIfAborted()
    const offline = new OfflineAudioContext(2, frames * (warmup + period), sampleRate)
    let hit = 0
    for (let cycle = 0; cycle < warmup + period; cycle++) {
      for (let step = 0; step < 32; step++) {
        const velocity = pattern.tracks[track.id][step]
        if (!velocity) continue
        const choke = track.id === 'openHat' ? nextHatChoke(pattern, step) : null
        if (choke === 0) continue
        const source = offline.createBufferSource()
        source.buffer = bank[track.id][hit++ % bank[track.id].length]
        const gain = offline.createGain()
        const at = cycle * duration + stepTime(step, frames, sampleRate)
        const level = velocity === 2 ? 1 : 0.72
        gain.gain.setValueAtTime(level, at)
        source.connect(gain).connect(offline.destination)
        source.start(at)
        if (choke !== null) {
          const end = cycle * duration + stepTime(step + choke, frames, sampleRate)
          gain.gain.setValueAtTime(level, Math.max(at, end - 0.006))
          gain.gain.linearRampToValueAtTime(0, end)
          source.stop(end)
        }
      }
    }
    pairs.push([track.id, await offline.startRendering()])
  }
  signal?.throwIfAborted()
  return {
    buffers: Object.fromEntries(pairs) as RenderedLoop['buffers'],
    loopStart,
    loopDuration: duration * period,
    duration,
  }
}
