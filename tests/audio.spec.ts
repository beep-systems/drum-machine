import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('drum-machine:locale', 'ru'))
})

test('real offline rendering preserves sample pitch, round robin, tails and hat choke', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const renderPath = '/src/audio/render.ts',
      modelPath = '/src/model.ts'
    const { renderLoop } = (await import(
      /* @vite-ignore */ renderPath
    )) as typeof import('../src/audio/render')
    const { emptyPattern, TRACKS } = (await import(
      /* @vite-ignore */ modelPath
    )) as typeof import('../src/model')
    const rate = 8000
    const makeSample = (level: number, length = 8000) => {
      const buffer = new AudioBuffer({ numberOfChannels: 1, length, sampleRate: rate })
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = level * (1 - i / length)
      return buffer
    }
    const bank = Object.fromEntries(
      TRACKS.map((t) => [t.id, [makeSample(0.5)]]),
    ) as import('../src/audio/timing').SampleBank
    bank.kick = [makeSample(0.5), makeSample(0.2)]
    const pattern = emptyPattern('audio test')
    pattern.tracks.kick[0] = 2
    pattern.tracks.kick[8] = 2
    pattern.tracks.kick[31] = 2 // odd count and a tail crossing the seam
    pattern.tracks.openHat[30] = 2
    pattern.tracks.closedHat[0] = 2
    pattern.tracks.crash[31] = 2
    const slow = await renderLoop(pattern, 100, bank, rate)
    const fast = await renderLoop(pattern, 200, bank, rate)
    const kick = slow.buffers.kick.getChannelData(0)
    const crash = slow.buffers.crash.getChannelData(0)
    const openHat = slow.buffers.openHat.getChannelData(0)
    const loopFrame = Math.round(slow.loopStart * rate)
    const seamJump = (data: Float32Array) => Math.abs(data[data.length - 1] - data[loopFrame])
    return {
      first: kick[0],
      second: kick[Math.round((slow.duration / 4) * rate)],
      pitchStable: Array.from(kick.slice(0, 200)).every(
        (v, i) => v === fast.buffers.kick.getChannelData(0)[i],
      ),
      cycleSeconds: slow.duration,
      loopSeconds: slow.loopDuration,
      kickSeam: seamJump(kick),
      crashSeam: seamJump(crash),
      crashTail: crash[loopFrame],
      openHatAfterChoke: openHat[loopFrame + 10],
      openHatBeforeChoke: openHat[loopFrame - 100],
    }
  })
  expect(result.first).toBeCloseTo(0.5)
  expect(result.second).toBeCloseTo(0.2)
  expect(result.pitchStable).toBe(true)
  expect(result.cycleSeconds).toBeCloseTo(4.8)
  expect(result.loopSeconds).toBeCloseTo(9.6)
  // There is a kick attack at the seam, but only the expected new hit may jump.
  expect(Math.abs(result.kickSeam - 0.5)).toBeLessThan(0.001)
  expect(result.crashSeam).toBeLessThan(0.001)
  expect(result.crashTail).toBeGreaterThan(0.1)
  expect(result.openHatAfterChoke).toBe(0)
  expect(result.openHatBeforeChoke).toBeGreaterThan(0)
})

test('all presets render real samples with energy, including 300 BPM double kick', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const renderPath = '/src/audio/render.ts',
      modelPath = '/src/model.ts'
    const { renderLoop } = (await import(
      /* @vite-ignore */ renderPath
    )) as typeof import('../src/audio/render')
    const { PRESETS, TRACKS } = (await import(/* @vite-ignore */ modelPath)) as typeof import('../src/model')
    const decoder = new OfflineAudioContext(2, 1, 48000)
    const bank = Object.fromEntries(
      await Promise.all(
        TRACKS.map(async (t) => [
          t.id,
          await Promise.all(
            t.samples.map(async (file) =>
              decoder.decodeAudioData(await (await fetch(`/samples/${file}.wav`)).arrayBuffer()),
            ),
          ),
        ]),
      ),
    ) as import('../src/audio/timing').SampleBank
    const output = []
    for (const preset of [...PRESETS, { ...PRESETS[3], bpm: 300 }]) {
      const loop = await renderLoop(preset.pattern, preset.bpm, bank, 48000)
      let energy = 0,
        finite = true
      for (const t of TRACKS)
        for (const sample of loop.buffers[t.id].getChannelData(0)) {
          energy += sample * sample
          finite &&= Number.isFinite(sample)
        }
      output.push({ name: preset.pattern.name, bpm: preset.bpm, energy, finite, duration: loop.duration })
    }
    return output
  })
  for (const rendered of result) {
    expect(rendered.energy).toBeGreaterThan(1)
    expect(rendered.finite).toBe(true)
    expect(rendered.duration).toBeCloseTo(480 / rendered.bpm, 4)
  }
})

test('playback survives a background tab and remains stoppable', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('checkbox', { name: /Отсчёт перед стартом/ }).uncheck()
  await page.getByRole('button', { name: /Двойная бочка/ }).click()
  await page.getByRole('spinbutton').fill('300')
  await page.getByRole('button', { name: 'Играть', exact: true }).click()
  await expect(page.getByText('Держим ритм', { exact: true })).toBeVisible()
  const other = await context.newPage()
  await other.goto('about:blank')
  await other.bringToFront()
  // Several 1.6-second cycles elapse without relying on the sequencer's animation.
  await other.waitForTimeout(5500)
  await page.bringToFront()
  await expect(page.getByText('Держим ритм', { exact: true })).toBeVisible()
  await expect(page.locator('.step.current')).toHaveCount(8)
  await page.getByRole('button', { name: 'Стоп', exact: true }).click()
  await expect(page.locator('.step.current')).toHaveCount(0)
  await other.close()
})
