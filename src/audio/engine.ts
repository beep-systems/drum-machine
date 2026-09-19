import { TRACKS, type Mixer, type Pattern, type TrackId } from '../model'
import { audioSignature, nextBoundary, type SampleBank } from './timing'
import { renderLoop, type RenderedLoop } from './render'

export type EngineStatus = 'idle' | 'loading' | 'rendering' | 'countin' | 'playing' | 'error'
export type EngineSnapshot = { status: EngineStatus; pending: boolean; error: string }
type Group = {
  sources: AudioBufferSourceNode[]
  gates: GainNode[]
  start: number
  duration: number
  signature: string
  bpm: number
}
type EngineDependencies = {
  context?: () => AudioContext
  load?: (ctx: AudioContext) => Promise<SampleBank>
  render?: typeof renderLoop
}

async function loadSamples(ctx: AudioContext): Promise<SampleBank> {
  const entries = await Promise.all(
    TRACKS.map(
      async (track) =>
        [
          track.id,
          await Promise.all(
            track.samples.map(async (name) => {
              const response = await fetch(`/samples/${name}.wav`, { signal: AbortSignal.timeout(20_000) })
              if (!response.ok) throw new Error(`Не загружен сэмпл ${name}.`)
              return ctx.decodeAudioData(await response.arrayBuffer())
            }),
          ),
        ] as const,
    ),
  )
  return Object.fromEntries(entries) as SampleBank
}

export class DrumEngine {
  private ctx?: AudioContext
  private master?: GainNode
  private channels = new Map<TrackId, GainNode>()
  private bank?: SampleBank
  private loading?: Promise<SampleBank>
  private active?: Group
  private queued?: Group
  private groups = new Set<Group>()
  private oneShots = new Set<AudioScheduledSourceNode>()
  private hatPreview?: AudioBufferSourceNode
  private version = 0
  private renderAbort?: AbortController
  private run = 0
  private wanted = false
  private desired?: { pattern: Pattern; bpm: number; signature: string }
  private mix?: Mixer
  private volume = 0.65
  private listeners = new Set<() => void>()
  private snapshot: EngineSnapshot = { status: 'idle', pending: false, error: '' }
  private deps: Required<EngineDependencies>

  constructor(deps: EngineDependencies = {}) {
    this.deps = {
      context: deps.context ?? (() => new AudioContext({ latencyHint: 'interactive' })),
      load: deps.load ?? loadSamples,
      render: deps.render ?? renderLoop,
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.snapshot
  private emit(change: Partial<EngineSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change }
    for (const listener of this.listeners) listener()
  }
  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.deps.context()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume * 0.55
      const compressor = this.ctx.createDynamicsCompressor()
      compressor.threshold.value = -8
      compressor.knee.value = 6
      compressor.ratio.value = 8
      this.master.connect(compressor).connect(this.ctx.destination)
      for (const track of TRACKS) {
        const channel = this.ctx.createGain()
        channel.gain.value = this.mix?.[track.id].muted ? 0 : (this.mix?.[track.id].volume ?? track.gain)
        channel.connect(this.master)
        this.channels.set(track.id, channel)
      }
      this.ctx.onstatechange = () => {
        if (this.wanted && this.ctx?.state !== 'running') {
          this.stop()
          this.emit({
            status: 'error',
            error: 'Браузер приостановил звук. Нажми «Играть», чтобы продолжить.',
          })
        }
      }
    }
    return this.ctx
  }
  private async samples(ctx: AudioContext): Promise<SampleBank> {
    if (this.bank) return this.bank
    if (!this.loading)
      this.loading = this.deps
        .load(ctx)
        .then((bank) => {
          this.bank = bank
          return bank
        })
        .finally(() => {
          this.loading = undefined
        })
    return this.loading
  }
  setMix(mixer: Mixer, master: number) {
    this.mix = mixer
    this.volume = master
    const at = this.ctx?.currentTime ?? 0
    this.master?.gain.setTargetAtTime(master * 0.55, at, 0.01)
    for (const track of TRACKS)
      this.channels
        .get(track.id)
        ?.gain.setTargetAtTime(mixer[track.id].muted ? 0 : mixer[track.id].volume, at, 0.01)
  }
  async start(pattern: Pattern, bpm: number, countIn: boolean) {
    if (this.wanted) return
    const run = ++this.run
    this.wanted = true
    this.desired = { pattern: structuredClone(pattern), bpm, signature: audioSignature(pattern, bpm) }
    this.emit({ status: 'loading', error: '', pending: false })
    try {
      const ctx = this.context()
      await ctx.resume()
      const bank = await this.samples(ctx)
      while (this.wanted && run === this.run) {
        const desired: NonNullable<DrumEngine['desired']> = this.desired!
        this.emit({ status: 'rendering' })
        this.renderAbort = new AbortController()
        const loop = await this.deps.render(
          desired.pattern,
          desired.bpm,
          bank,
          ctx.sampleRate,
          this.renderAbort.signal,
        )
        if (!this.wanted || run !== this.run) return
        if (desired.signature !== this.desired?.signature) continue
        const beginning = ctx.currentTime + 0.06
        const delay = countIn ? 240 / desired.bpm : 0
        if (countIn) this.countIn(beginning, desired.bpm)
        this.active = this.schedule(loop, beginning + delay, desired.signature, desired.bpm, false)
        this.emit({ status: countIn ? 'countin' : 'playing', pending: false })
        return
      }
    } catch (error) {
      if (run === this.run && this.wanted) this.fail(error)
    }
  }
  update(pattern: Pattern, bpm: number) {
    const signature = audioSignature(pattern, bpm)
    if (signature === this.desired?.signature) return
    this.desired = { pattern: structuredClone(pattern), bpm, signature }
    if (!this.wanted || !this.active || !this.bank || !this.ctx) return
    this.promote()
    const version = ++this.version
    const run = this.run
    this.renderAbort?.abort()
    this.renderAbort = new AbortController()
    this.emit({ pending: true })
    void this.deps
      .render(pattern, bpm, this.bank, this.ctx.sampleRate, this.renderAbort.signal)
      .then((loop) => {
        if (version !== this.version || run !== this.run || !this.wanted || !this.ctx) return
        this.promote()
        const current = this.active!
        const at =
          this.queued && this.queued.start > this.ctx.currentTime + 0.04
            ? this.queued.start
            : nextBoundary(this.ctx.currentTime, current.start, current.duration)
        if (this.queued) this.cancelGroup(this.queued)
        // Gain automation can be rescheduled; stopping an active source cannot be undone.
        for (const gate of current.gates) {
          gate.gain.cancelScheduledValues(this.ctx.currentTime)
          gate.gain.setValueAtTime(1, this.ctx.currentTime)
          gate.gain.setValueAtTime(1, at)
          gate.gain.linearRampToValueAtTime(0, at + 0.008)
        }
        this.queued = this.schedule(loop, at, signature, bpm, true)
      })
      .catch((error) => {
        if (version === this.version && run === this.run) this.fail(error)
      })
  }
  private schedule(loop: RenderedLoop, at: number, signature: string, bpm: number, steady: boolean): Group {
    const ctx = this.ctx!
    const sources: AudioBufferSourceNode[] = []
    const group: Group = { sources, gates: [], start: at, duration: loop.duration, signature, bpm }
    for (const track of TRACKS) {
      const source = ctx.createBufferSource()
      source.buffer = loop.buffers[track.id]
      source.loop = true
      source.loopStart = loop.loopStart
      source.loopEnd = loop.loopStart + loop.loopDuration
      const gate = ctx.createGain()
      if (steady) {
        gate.gain.setValueAtTime(0, at)
        gate.gain.linearRampToValueAtTime(1, at + 0.008)
      }
      source.connect(gate).connect(this.channels.get(track.id)!)
      sources.push(source)
      group.gates.push(gate)
      source.onended = () => {
        source.disconnect()
        gate.disconnect()
      }
      source.start(at, steady ? loop.loopStart : 0)
    }
    this.groups.add(group)
    return group
  }
  private countIn(at: number, bpm: number) {
    const ctx = this.ctx!
    for (let beat = 0; beat < 4; beat++) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = at + (beat * 60) / bpm
      oscillator.frequency.value = beat === 0 ? 1200 : 850
      gain.gain.setValueAtTime(0.18, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05)
      oscillator.connect(gain).connect(this.master!)
      oscillator.start(start)
      oscillator.stop(start + 0.06)
      this.oneShots.add(oscillator)
      oscillator.onended = () => {
        this.oneShots.delete(oscillator)
        oscillator.disconnect()
        gain.disconnect()
      }
    }
  }
  private promote() {
    if (this.queued && this.ctx && this.ctx.currentTime >= this.queued.start) {
      if (this.active) this.cancelGroup(this.active, this.queued.start + 0.009)
      this.active = this.queued
      this.queued = undefined
      this.emit({ pending: this.active.signature !== this.desired?.signature })
    }
  }
  position(): { step: number; beat: number; bpm: number } {
    this.promote()
    const group = this.active
    if (!this.wanted || !group || !this.ctx) return { step: -1, beat: 0, bpm: this.desired?.bpm ?? 100 }
    const elapsed = this.ctx.currentTime - group.start
    if (elapsed < 0)
      return {
        step: -1,
        beat: Math.max(1, Math.min(4, 5 + Math.floor((elapsed * group.bpm) / 60))),
        bpm: group.bpm,
      }
    if (this.snapshot.status === 'countin') this.emit({ status: 'playing' })
    return { step: Math.floor(((elapsed % group.duration) / group.duration) * 32), beat: 0, bpm: group.bpm }
  }
  private cancelGroup(group: Group, at = this.ctx?.currentTime ?? 0) {
    for (const gate of group.gates) {
      gate.gain.cancelAndHoldAtTime(at)
      gate.gain.linearRampToValueAtTime(0, at + 0.008)
    }
    for (const source of group.sources) source.stop(at + 0.009)
    this.groups.delete(group)
  }
  stop() {
    this.run++
    this.version++
    this.renderAbort?.abort()
    this.wanted = false
    for (const group of this.groups) this.cancelGroup(group)
    for (const source of this.oneShots) {
      try {
        source.stop()
      } catch {
        /* Already ended. */
      }
    }
    this.oneShots.clear()
    this.active = undefined
    this.queued = undefined
    this.emit({ status: 'idle', pending: false, error: '' })
  }
  private fail(error: unknown) {
    this.stop()
    this.emit({
      status: 'error',
      error: `${error instanceof Error ? error.message : 'Не удалось подготовить звук.'} Нажми «Играть», чтобы повторить.`,
    })
  }
  async preview(track: TrackId) {
    const run = this.run
    try {
      const ctx = this.context()
      await ctx.resume()
      const bank = await this.samples(ctx)
      if (run !== this.run) return
      if (track === 'closedHat' || track === 'openHat') this.hatPreview?.stop()
      const source = ctx.createBufferSource()
      source.buffer = bank[track][0]
      source.connect(this.channels.get(track)!)
      source.start()
      this.oneShots.add(source)
      if (track === 'openHat') this.hatPreview = source
      source.onended = () => {
        this.oneShots.delete(source)
        source.disconnect()
        if (this.hatPreview === source) this.hatPreview = undefined
      }
    } catch (error) {
      if (run === this.run) this.fail(error)
    }
  }
  dispose() {
    this.stop()
    void this.ctx?.close()
    this.listeners.clear()
  }
}
