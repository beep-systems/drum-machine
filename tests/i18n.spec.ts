import { expect, test, type Page } from '@playwright/test'
import { initialState } from '../src/model'

async function music(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('drum-machine:v1') || 'null'))
}

async function instrumentAudio(page: Page) {
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext
    const stats = { contexts: 0, starts: 0 }
    Object.defineProperty(window, 'audioTestStats', { value: stats })
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options)
        stats.contexts++
      }
      override createBufferSource() {
        const node = super.createBufferSource()
        const start = node.start.bind(node)
        node.start = (...args: Parameters<typeof node.start>) => {
          if (node.loop) stats.starts++
          start(...args)
        }
        return node
      }
    }
  })
}

async function audioStats(page: Page) {
  return page.evaluate(
    () => (window as unknown as { audioTestStats: { contexts: number; starts: number } }).audioTestStats,
  )
}

for (const browserLocale of ['de-DE', 'ru-RU']) {
  test(`first visit uses English with a ${browserLocale} browser`, async ({ browser }) => {
    const context = await browser.newContext({ locale: browserLocale })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.locator('#editor-heading')).toHaveText('Basic rock')
    await context.close()
  })
}

test('changes all UI languages and metadata without renaming stored music', async ({ page }) => {
  const legacy = initialState()
  legacy.session.pattern.name = 'Мой Riff Ä'
  legacy.library = [{ id: 'custom-1', pattern: legacy.session.pattern, bpm: 137 }]
  await page.addInitScript((state) => {
    if (!localStorage.getItem('drum-machine:v1'))
      localStorage.setItem('drum-machine:v1', JSON.stringify(state))
  }, legacy)
  await page.goto('/')
  const before = await music(page)
  await page.locator('select').first().focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox', { name: 'Sprache' })).toHaveValue('de')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page).toHaveTitle('Online Drum Machine zum Gitarreüben | Rock & Metal')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Online Drum Machine/)
  await expect(page.getByLabel('Stummschalten: Bassdrum', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Rock-Grundrhythmus/ })).toBeVisible()
  await expect(page.locator('#editor-heading')).toHaveText('Мой Riff Ä')
  await expect(page.locator('.saved-item strong')).toHaveText('Мой Riff Ä')
  await page.reload()
  await expect(page.locator('select').first()).toHaveValue('de')
  await page.locator('select').first().selectOption('ru')
  await expect(page.getByLabel('Выключить: Бочка', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await page.locator('select').first().selectOption('en')
  await expect(page.getByLabel('Mute: Kick', { exact: true })).toBeVisible()
  expect(await music(page)).toEqual(before)
  const exported = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await exported
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({
    version: 1,
    kind: 'drum-machine-library',
    patterns: legacy.library,
  })
})

test('choosing a preset localizes the working copy, without renaming it on later language changes', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('select').first().selectOption('de')
  await page.getByRole('button', { name: /Rock-Grundrhythmus/ }).click()
  await expect(page.locator('#editor-heading')).toHaveText('Rock-Grundrhythmus')
  await page.locator('select').first().selectOption('ru')
  await expect(page.locator('#editor-heading')).toHaveText('Rock-Grundrhythmus')
  await page.getByRole('button', { name: /Двойная бочка/ }).click()
  await expect(page.locator('#editor-heading')).toHaveText('Двойная бочка')
  await expect(page.getByRole('spinbutton')).toHaveValue('140')
})

test('existing notices and audio errors switch language without retrying', async ({ page }) => {
  let requests = 0
  await page.route('**/samples/kick-1.wav', async (route) => {
    requests++
    await route.fulfill({ status: 404, body: 'missing' })
  })
  await page.goto('/')
  await page
    .getByLabel('Import library')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByText('Could not read JSON. The library has not changed.')).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load sample kick-1')
  await page.locator('select').first().selectOption('de')
  await expect(
    page.getByText('JSON konnte nicht gelesen werden. Die Bibliothek wurde nicht verändert.'),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Sample kick-1 konnte nicht geladen werden')
  await page.locator('select').first().selectOption('ru')
  await expect(page.getByRole('alert')).toContainText('Не загружен сэмпл kick-1')
  await expect(page.getByText('Не удалось прочитать JSON. Библиотека не изменена.')).toBeVisible()
  expect(requests).toBe(1)
})

test('invalid locale and denied storage use English and allow in-memory switching', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('drum-machine:locale', 'fr')
    Storage.prototype.setItem = () => {
      throw new Error('denied')
    }
  })
  await page.goto('/')
  await expect(page.locator('select').first()).toHaveValue('en')
  await expect(page.getByRole('alert')).toContainText('Settings are not being saved')
  await page.locator('select').first().selectOption('de')
  await expect(page.getByRole('alert')).toContainText('Einstellungen werden nicht gespeichert')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
})

test('denied localStorage getter still allows language changes', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('denied')
      },
    })
  })
  await page.goto('/')
  await expect(page.locator('select').first()).toHaveValue('en')
  await page.locator('select').first().selectOption('ru')
  await expect(page.getByRole('alert')).toContainText('Хранилище браузера недоступно')
})

test('language preference never overwrites damaged saved music', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('drum-machine:v1', '{broken'))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Autosave is disabled')
  await page.locator('select').first().selectOption('de')
  await expect(page.getByRole('alert')).toContainText('Automatisches Speichern ist deaktiviert')
  await page.getByRole('spinbutton').fill('180')
  await page.getByLabel('Name des Rhythmus').fill('Mein Riff')
  await page.getByRole('button', { name: 'Rhythmus speichern', exact: true }).click()
  await expect(page.locator('.saved-item')).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('drum-machine:v1'))).toBe('{broken')
  expect(await page.evaluate(() => localStorage.getItem('drum-machine:locale'))).toBe('de')
})

test('switching language during loading does not prevent Stop from cancelling startup', async ({ page }) => {
  await instrumentAudio(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/samples/*.wav', async (route) => {
    await gate
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByText('Loading the kit…', { exact: true })).toBeVisible()
  await page.locator('select').first().selectOption('de')
  await expect(page.getByText('Schlagzeug wird geladen…', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stopp', exact: true }).click()
  release()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  expect(await audioStats(page)).toEqual({ contexts: 1, starts: 0 })
})

test('language changes during rendering keep one startup', async ({ page }) => {
  await instrumentAudio(page)
  await page.addInitScript(() => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    Object.defineProperty(window, 'releaseTestRender', { value: release })
    const original = OfflineAudioContext.prototype.startRendering
    OfflineAudioContext.prototype.startRendering = async function () {
      await gate
      return original.call(this)
    }
  })
  await page.goto('/')
  await page.getByRole('checkbox', { name: /Count-in/ }).uncheck()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByText('Preparing the rhythm…', { exact: true })).toBeVisible()
  await page.locator('select').first().selectOption('ru')
  await expect(page.getByText('Готовим ритм…', { exact: true })).toBeVisible()
  await page.evaluate(() => (window as unknown as { releaseTestRender: () => void }).releaseTestRender())
  await expect(page.getByText('Держим ритм', { exact: true })).toBeVisible()
  expect(await audioStats(page)).toEqual({ contexts: 1, starts: 8 })
  await page.getByRole('button', { name: 'Стоп', exact: true }).click()
})

test('switching during count-in and playback preserves audio sources and musical state', async ({ page }) => {
  await instrumentAudio(page)
  await page.goto('/')
  await page.getByRole('spinbutton').fill('60')
  await expect.poll(async () => (await music(page))?.session.bpm).toBe(60)
  const before = await music(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByText(/Get ready/)).toBeVisible()
  await page.locator('select').first().selectOption('de')
  await expect(page.getByText(/Mach dich bereit/)).toBeVisible()
  await expect(page.getByText('Der Beat läuft', { exact: true })).toBeVisible()
  await page.locator('select').first().selectOption('ru')
  await expect(page.getByText('Держим ритм', { exact: true })).toBeVisible()
  await expect(page.locator('.step.current')).toHaveCount(8)
  expect(await audioStats(page)).toEqual({ contexts: 1, starts: 8 })
  expect(await music(page)).toEqual(before)
  await page.getByRole('button', { name: 'Стоп', exact: true }).click()
  await expect(page.locator('.step.current')).toHaveCount(0)
})

for (const locale of ['en', 'de', 'ru']) {
  test(`layout fits on desktop and mobile in ${locale}`, async ({ page }) => {
    await page.goto('/')
    await page.locator('select').first().selectOption(locale)
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      expect(
        await page
          .locator('.preset strong, .preset-description')
          .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth + 1)),
      ).toBe(true)
      await expect(page.locator('select').first()).toBeVisible()
    }
  })
}
