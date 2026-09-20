import { expect, test } from '@playwright/test'

test('real kit switch schedules all tracks at a loop boundary', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const enginePath = '/src/audio/engine.ts',
      modelPath = '/src/model.ts'
    const { DrumEngine } = (await import(
      /* @vite-ignore */ enginePath
    )) as typeof import('../src/audio/engine')
    const { PRESETS } = (await import(/* @vite-ignore */ modelPath)) as typeof import('../src/model')
    const ctx = new AudioContext()
    const starts: number[] = []
    const create = ctx.createBufferSource.bind(ctx)
    ctx.createBufferSource = () => {
      const source = create()
      const start = source.start.bind(source)
      source.start = (at = 0, offset = 0) => {
        starts.push(at)
        start(at, offset)
      }
      return source
    }
    const engine = new DrumEngine({ context: () => ctx })
    try {
      await engine.start(PRESETS[0].pattern, 300, false, 'acoustic')
      engine.update(PRESETS[0].pattern, 150, 'industrial')
      const deadline = performance.now() + 10000
      while (starts.length < 16 && performance.now() < deadline) {
        if (engine.getSnapshot().error) throw new Error(JSON.stringify(engine.getSnapshot().error))
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      return { starts, pending: engine.getSnapshot().pending }
    } finally {
      engine.dispose()
    }
  })
  expect(result.starts).toHaveLength(16)
  expect(new Set(result.starts.slice(8)).size).toBe(1)
  const cycles = (result.starts[8] - result.starts[0]) / 1.6
  expect(cycles).toBeGreaterThanOrEqual(1)
  expect(cycles).toBeCloseTo(Math.round(cycles), 5)
  expect(result.pending).toBe(true)
})

test('kit choice follows presets and survives save, export, import and reload', async ({ page }) => {
  await page.goto('/')
  const kit = page.getByRole('switch', { name: 'Drum kit Industrial' })
  await expect(kit).not.toBeChecked()
  await page.getByRole('button', { name: 'Industrial', exact: true }).click()
  await expect(page.locator('.preset')).toHaveCount(5)
  await page.locator('.preset').filter({ hasText: 'Industrial March' }).click()
  await expect(kit).toBeChecked()
  await kit.click()
  await expect(page.locator('.preset.selected')).toHaveCount(0)
  await kit.focus()
  await page.keyboard.press('Space')
  await expect(kit).toBeChecked()
  await page.keyboard.press('Enter')
  await expect(kit).not.toBeChecked()
  await page.keyboard.press('Enter')
  await expect(kit).toBeChecked()
  await page.getByRole('textbox', { name: 'Rhythm name' }).fill('My Industrial')
  await page.getByRole('button', { name: 'Save rhythm', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('drum-machine:v1') ?? '{}').session?.kitId),
    )
    .toBe('industrial')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const file = await (await download).path()
  await page.reload()
  await expect(kit).toBeChecked()
  await kit.click()
  await page.getByRole('button', { name: 'My Industrial', exact: false }).first().click()
  await expect(kit).toBeChecked()
  await page.locator('input[type=file]').setInputFiles(file!)
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('drum-machine:v1') ?? '{}').library?.length),
    )
    .toBe(1)
  await page.getByRole('checkbox').uncheck()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByText('Keeping the beat', { exact: true })).toBeVisible()
  await page.locator('.language-picker select').selectOption('de')
  await expect(page.getByRole('switch', { name: 'Schlagzeugset Industrial' })).toBeChecked()
  await page.locator('.language-picker select').selectOption('ru')
  await expect(page.getByRole('switch', { name: 'Набор ударных Industrial' })).toBeChecked()
  await expect(page.locator('.step.current')).toHaveCount(8)
})
