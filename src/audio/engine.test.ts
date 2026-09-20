import { describe, expect, it, vi } from 'vitest'
import { initialState, PRESETS, TRACKS } from '../model'
import { DrumEngine } from './engine'
import type { SampleBank } from './timing'
import type { RenderedLoop } from './render'

class Param {
  value = 1
  setValueAtTime = vi.fn()
  setTargetAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
  cancelScheduledValues = vi.fn()
  cancelAndHoldAtTime = vi.fn()
}
class Node {
  gain = new Param()
  frequency = new Param()
  threshold = new Param()
  knee = new Param()
  ratio = new Param()
  start = vi.fn()
  stop = vi.fn()
  disconnect = vi.fn()
  connect<T>(target: T) {
    return target
  }
}
class Context {
  currentTime = 0
  sampleRate = 48000
  state = 'running'
  destination = new Node()
  sources: Node[] = []
  oscillators: Node[] = []
  gains: Node[] = []
  resume = vi.fn(async () => {})
  close = vi.fn(async () => {})
  createGain() {
    const node = new Node()
    this.gains.push(node)
    return node
  }
  createDynamicsCompressor() {
    return new Node()
  }
  createBufferSource() {
    const node = new Node()
    this.sources.push(node)
    return node
  }
  createOscillator() {
    const node = new Node()
    this.oscillators.push(node)
    return node
  }
}
const bank = {} as SampleBank
const loop = (bpm = 100): RenderedLoop => ({
  duration: 480 / bpm,
  loopDuration: 480 / bpm,
  loopStart: 480 / bpm,
  buffers: Object.fromEntries(TRACKS.map((t) => [t.id, {}])) as RenderedLoop['buffers'],
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}
function setup(render = vi.fn(async (_p, bpm: number) => loop(bpm))) {
  const ctx = new Context()
  const engine = new DrumEngine({
    context: () => ctx as unknown as AudioContext,
    load: async () => bank,
    render,
  })
  return { ctx, engine, render }
}

describe('audio lifecycle', () => {
  it('withdraws an obsolete queued kit while another load is pending', async () => {
    const { engine, ctx, render } = setup()
    await engine.start(PRESETS[0].pattern, 100, false)
    ctx.currentTime = 1
    engine.update(PRESETS[0].pattern, 120, 'industrial')
    await flush()
    expect(ctx.sources).toHaveLength(16)
    const delayed = deferred<RenderedLoop>()
    render.mockImplementationOnce(() => delayed.promise)
    engine.update(PRESETS[1].pattern, 150, 'acoustic')
    for (const source of ctx.sources.slice(8)) expect(source.stop).toHaveBeenCalled()
    engine.stop()
    delayed.reject(new Error('obsolete render'))
    await flush()
    expect(engine.getSnapshot().status).toBe('idle')
  })
  it('stops on an active kit error without automatically retrying', async () => {
    const ctx = new Context()
    const load = vi.fn(async (_ctx: AudioContext, kit: string) => {
      if (kit === 'industrial') throw new Error('missing')
      return bank
    })
    const engine = new DrumEngine({
      context: () => ctx as unknown as AudioContext,
      load,
      render: async () => loop(),
    })
    await engine.start(PRESETS[0].pattern, 100, false)
    ctx.currentTime = 1
    engine.update(PRESETS[0].pattern, 100, 'industrial')
    await flush()
    expect(engine.getSnapshot().status).toBe('error')
    engine.update(PRESETS[1].pattern, 150, 'industrial')
    await flush()
    expect(load).toHaveBeenCalledTimes(2)
    for (const source of ctx.sources) expect(source.stop).toHaveBeenCalled()
  })
  it('does not play a delayed preview after switching kits', async () => {
    const ctx = new Context()
    const pending = deferred<SampleBank>()
    const engine = new DrumEngine({
      context: () => ctx as unknown as AudioContext,
      load: () => pending.promise,
    })
    const preview = engine.preview('kick', 'industrial')
    await flush()
    engine.update(PRESETS[0].pattern, 100, 'acoustic')
    pending.resolve(bank)
    await preview
    expect(ctx.sources).toHaveLength(0)
  })
  it('loads only requested kits, ignores an obsolete load error and reuses cached audio', async () => {
    const ctx = new Context()
    const electronic = deferred<SampleBank>()
    const load = vi.fn((_ctx: AudioContext, kit: string) =>
      kit === 'industrial' ? electronic.promise : Promise.resolve(bank),
    )
    const engine = new DrumEngine({
      context: () => ctx as unknown as AudioContext,
      load,
      render: async () => loop(),
    })
    await engine.start(PRESETS[0].pattern, 100, false)
    ctx.currentTime = 1
    engine.update(PRESETS[0].pattern, 100, 'industrial')
    engine.update(PRESETS[0].pattern, 100, 'acoustic')
    electronic.reject(new Error('obsolete'))
    await flush()
    expect(load.mock.calls.map((call) => call[1])).toEqual(['acoustic', 'industrial'])
    expect(engine.getSnapshot().status).toBe('playing')
    expect(ctx.sources).toHaveLength(16)
  })
  it('uses the newest kit and tempo when startup loading becomes obsolete', async () => {
    const ctx = new Context()
    const acoustic = deferred<SampleBank>()
    const electronic = {} as SampleBank
    const render = vi.fn(async (_p, bpm: number) => loop(bpm))
    const engine = new DrumEngine({
      context: () => ctx as unknown as AudioContext,
      load: async (_ctx, kit) => (kit === 'acoustic' ? acoustic.promise : electronic),
      render,
    })
    const start = engine.start(PRESETS[0].pattern, 100, false)
    await flush()
    engine.update(PRESETS[1].pattern, 150, 'industrial')
    acoustic.reject(new Error('obsolete'))
    await start
    expect(render).toHaveBeenCalledTimes(1)
    expect(render.mock.calls[0][1]).toBe(150)
    expect(engine.position().bpm).toBe(150)
    expect(engine.getSnapshot().status).toBe('playing')
  })
  it('cancels a kit load and pending preview on Stop', async () => {
    const ctx = new Context()
    const electronic = deferred<SampleBank>()
    const engine = new DrumEngine({
      context: () => ctx as unknown as AudioContext,
      load: async (_ctx, kit) => (kit === 'industrial' ? electronic.promise : bank),
      render: async () => loop(),
    })
    await engine.start(PRESETS[0].pattern, 100, false)
    engine.update(PRESETS[0].pattern, 100, 'industrial')
    const preview = engine.preview('kick', 'industrial')
    await flush()
    engine.stop()
    electronic.resolve(bank)
    await preview
    await flush()
    expect(ctx.sources).toHaveLength(8)
    expect(engine.getSnapshot().status).toBe('idle')
  })
  it('withdraws future sources and restarts count-in with the new kit', async () => {
    const { engine, ctx } = setup()
    await engine.start(PRESETS[0].pattern, 100, true)
    ctx.currentTime = 0.5
    engine.update(PRESETS[0].pattern, 100, 'industrial')
    await flush()
    expect(ctx.sources).toHaveLength(16)
    for (const source of ctx.sources.slice(8)) expect(source.start).toHaveBeenCalledWith(2.96, 0)
    expect(ctx.oscillators).toHaveLength(8)
    for (const source of ctx.sources.slice(0, 8)) expect(source.stop).toHaveBeenCalled()
  })
  it('never starts if stopped while loading samples', async () => {
    const ctx = new Context()
    const load = deferred<SampleBank>()
    const render = vi.fn(async () => loop())
    const engine = new DrumEngine({
      context: () => ctx as unknown as AudioContext,
      load: () => load.promise,
      render,
    })
    const start = engine.start(PRESETS[0].pattern, 100, true)
    await flush()
    engine.stop()
    load.resolve(bank)
    await start
    expect(render).not.toHaveBeenCalled()
    expect(ctx.sources).toHaveLength(0)
    expect(engine.getSnapshot().status).toBe('idle')
  })
  it('discards a prepared start after stop and does not double-start', async () => {
    const prepared = deferred<RenderedLoop>()
    const { engine, ctx, render } = setup(vi.fn(() => prepared.promise))
    const start = engine.start(PRESETS[0].pattern, 100, false)
    await flush()
    await engine.start(PRESETS[0].pattern, 100, false)
    expect(render).toHaveBeenCalledTimes(1)
    engine.stop()
    prepared.resolve(loop())
    await start
    expect(ctx.sources).toHaveLength(0)
  })
  it('starts all tracks together and cancels the count-in and future sources', async () => {
    const { engine, ctx } = setup()
    await engine.start(PRESETS[0].pattern, 100, true)
    expect(ctx.oscillators).toHaveLength(4)
    expect(ctx.sources).toHaveLength(8)
    for (const source of ctx.sources) expect(source.start).toHaveBeenCalledWith(2.46, 0)
    engine.stop()
    for (const source of [...ctx.sources, ...ctx.oscillators]) expect(source.stop).toHaveBeenCalled()
    expect(engine.position().step).toBe(-1)
  })
  it('changes tempo only at a cycle boundary, retaining old tempo until then', async () => {
    const { engine, ctx } = setup()
    await engine.start(PRESETS[0].pattern, 100, false)
    ctx.currentTime = 1
    engine.update(PRESETS[0].pattern, 200)
    await flush()
    expect(ctx.sources).toHaveLength(16)
    for (const source of ctx.sources.slice(8))
      expect(source.start).toHaveBeenCalledWith(4.859999999999999, 2.4)
    expect(engine.position().bpm).toBe(100)
    ctx.currentTime = 4.87
    expect(engine.position().bpm).toBe(200)
    expect(engine.getSnapshot().pending).toBe(false)
  })
  it('ignores older render results when edits finish out of order', async () => {
    const { engine, ctx, render } = setup()
    await engine.start(PRESETS[0].pattern, 100, false)
    const older = deferred<RenderedLoop>(),
      newer = deferred<RenderedLoop>()
    render.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise)
    engine.update(PRESETS[1].pattern, 120)
    engine.update(PRESETS[2].pattern, 80)
    newer.resolve(loop(80))
    await flush()
    older.resolve(loop(120))
    await flush()
    expect(ctx.sources).toHaveLength(16)
    ctx.currentTime = 5
    expect(engine.position().bpm).toBe(80)
  })
  it('stop cancels a scheduled replacement as well as the active loop', async () => {
    const { engine, ctx } = setup()
    await engine.start(PRESETS[0].pattern, 100, false)
    engine.update(PRESETS[1].pattern, 120)
    await flush()
    engine.stop()
    for (const source of ctx.sources) expect(source.stop).toHaveBeenCalled()
    expect(engine.getSnapshot().pending).toBe(false)
  })
  it('applies mute and master volume without re-rendering', async () => {
    const { engine, ctx, render } = setup()
    await engine.start(PRESETS[0].pattern, 100, false)
    const session = initialState().session
    session.mixer.kick.muted = true
    engine.setMix(session.mixer, 0)
    expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.01)
    expect(ctx.gains[1].gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.01)
    expect(render).toHaveBeenCalledTimes(1)
  })
  it('retries after a sample error and does not leave a stuck playing state', async () => {
    const ctx = new Context()
    const load = vi.fn().mockRejectedValueOnce(new Error('missing.wav')).mockResolvedValue(bank)
    const engine = new DrumEngine({
      context: () => ctx as unknown as AudioContext,
      load,
      render: async () => loop(),
    })
    await engine.start(PRESETS[0].pattern, 100, false)
    expect(engine.getSnapshot().status).toBe('error')
    await engine.start(PRESETS[0].pattern, 100, false)
    expect(engine.getSnapshot().status).toBe('playing')
  })
})
