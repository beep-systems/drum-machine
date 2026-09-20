import { expect, test } from '@playwright/test'
import { PRESETS } from '../src/model'
import { exportLibrary } from '../src/storage'

// Keep the original Russian scenarios as a regression suite; i18n.spec covers the English default.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('drum-machine:locale', 'ru'))
})

test('edit, accent, mix, save, export, import and restore without autoplay', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('spinbutton')).toHaveValue('100')
  const cell = page.locator('[data-cell="1"]')
  await cell.click()
  await expect(cell).toHaveAttribute('data-value', '1')
  await cell.click({ modifiers: ['Shift'] })
  await expect(cell).toHaveAttribute('data-value', '2')
  await page.getByLabel('Выключить: Бочка', { exact: true }).click()
  await page.getByRole('spinbutton').fill('137')
  await page.getByLabel('Название ритма').fill('Мой тяжёлый рифф')
  await page.getByRole('button', { name: 'Сохранить ритм', exact: true }).click()
  await expect(page.locator('.saved-item')).toHaveCount(1)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('drum-machine-library.json')
  await page.getByLabel('Импорт библиотеки').setInputFiles({
    name: 'library.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportLibrary([PRESETS[4]])),
  })
  await expect(page.locator('.saved-item')).toHaveCount(2)
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('drum-machine:v1') || 'null')?.library.length),
    )
    .toBe(2)
  await page.reload()
  await expect(cell).toHaveAttribute('data-value', '2')
  await expect(page.getByRole('spinbutton')).toHaveValue('137')
  await expect(page.getByLabel('Выключить: Бочка', { exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Играть', exact: true })).toBeVisible()
  await page
    .getByLabel('Импорт библиотеки')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') })
  await expect(page.getByText('Не удалось прочитать JSON. Библиотека не изменена.')).toBeVisible()
  await expect(page.locator('.saved-item')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('plays, counts in, edits at a boundary, stops and supports the keyboard', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('spinbutton').fill('300')
  await page.getByRole('button', { name: 'Играть', exact: true }).click()
  await expect(page.getByText(/Приготовься/)).toBeVisible()
  await expect(page.getByText('Держим ритм', { exact: true })).toBeVisible()
  await expect(page.locator('.step.current')).toHaveCount(8)
  await page.locator('[data-cell="1"]').click()
  await expect(page.getByText('Изменения со следующего цикла')).toBeVisible()
  await expect(page.getByText('Изменения со следующего цикла')).toBeHidden({ timeout: 5000 })
  await page.getByRole('button', { name: 'Стоп', exact: true }).click()
  await expect(page.locator('.step.current')).toHaveCount(0)
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Стоп', exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Играть', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('sample failure can be retried; stop while loading cannot start later', async ({ page }) => {
  await page.route('**/samples/kick-1.wav', (route) => route.fulfill({ status: 404, body: 'missing' }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Играть', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Не загружен сэмпл')
  await page.unroute('**/samples/kick-1.wav')
  await page.getByRole('checkbox', { name: /Отсчёт перед стартом/ }).uncheck()
  await page.getByRole('button', { name: 'Играть', exact: true }).click()
  await expect(page.getByText('Держим ритм', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Стоп', exact: true }).click()
  await page.reload()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/samples/*.wav', async (route) => {
    await gate
    await route.continue()
  })
  await page.getByRole('button', { name: 'Играть', exact: true }).click()
  await expect(page.getByText('Загружаем установку…', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Стоп', exact: true }).click()
  release()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Играть', exact: true })).toBeVisible()
  await expect(page.locator('.step.current')).toHaveCount(0)
})

test('handles unavailable localStorage', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('quota')
    }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Настройки не сохраняются')
  await page.getByLabel('Название ритма').fill('В памяти')
  await page.getByRole('button', { name: 'Сохранить ритм', exact: true }).click()
  await expect(page.locator('.saved-item')).toHaveCount(1)
})

test('responsive layout confines horizontal scrolling to the sequencer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await page.locator('.grid-scroll').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await expect(page.getByRole('button', { name: 'Играть', exact: true })).toBeVisible()
})

test('damaged storage is reported and never overwritten automatically', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('drum-machine:v1', '{broken'))
  // Navigate without firing the old document's pagehide persistence handler.
  await page.addInitScript(() => localStorage.setItem('drum-machine:v1', '{broken'))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Автосохранение отключено')
  await page.getByRole('spinbutton').fill('180')
  await page.getByLabel('Название ритма').fill('Восстановленный')
  await page.getByRole('button', { name: 'Сохранить ритм', exact: true }).click()
  await expect(page.locator('.saved-item')).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('drum-machine:v1'))).toBe('{broken')
})

test('all bundled acoustic samples decode and have bounded peaks and clean ends', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const manifest = (await fetch('/samples/manifest.json').then((r) => r.json())) as {
      samples: { file: string }[]
    }
    const ctx = new OfflineAudioContext(2, 1, 48000)
    return Promise.all(
      manifest.samples.map(async (item) => {
        const response = await fetch(`/samples/${item.file}`)
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
        let peak = 0,
          energy = 0
        const channel = buffer.getChannelData(0)
        for (const value of channel) {
          peak = Math.max(peak, Math.abs(value))
          energy += value * value
        }
        return {
          file: item.file,
          peak,
          energy,
          first: channel[0],
          last: channel[channel.length - 1],
          duration: buffer.duration,
        }
      }),
    )
  })
  expect(result).toHaveLength(10)
  for (const sample of result) {
    expect(sample.peak).toBeLessThanOrEqual(0.801)
    expect(sample.energy).toBeGreaterThan(0.01)
    expect(sample.first).toBe(0)
    expect(sample.last).toBe(0)
    expect(sample.duration).toBeLessThan(6.01)
  }
})
