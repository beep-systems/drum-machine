import { expect, test } from '@playwright/test'

test('built site serves bundled assets, samples and attribution', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  const assets = await page
    .locator('script[src], link[rel="stylesheet"], link[rel="icon"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src') || node.getAttribute('href') || ''))
  expect(assets.some((url) => /^\/assets\/.*\.js$/.test(url))).toBe(true)
  expect(assets.some((url) => /^\/assets\/.*\.css$/.test(url))).toBe(true)
  expect(assets).toContain('/favicon.svg')
  for (const asset of assets) expect((await request.get(asset)).ok()).toBe(true)
  const attribution = await request.get('/samples/README.md')
  expect(attribution.ok()).toBe(true)
  expect(await attribution.text()).toContain('Alexander Holm')
  expect((await request.get('/samples/LICENSE.txt')).ok()).toBe(true)
  const manifestResponse = await request.get('/samples/manifest.json')
  expect(manifestResponse.ok()).toBe(true)
  const manifest = (await manifestResponse.json()) as { samples: { file: string }[] }
  expect(manifest.samples).toHaveLength(10)
  const industrial = await (await request.get('/samples/industrial/manifest.json')).json()
  expect(industrial.samples).toHaveLength(8)
  for (const { file } of industrial.samples) {
    const sample = await request.get(`/samples/industrial/${file}`)
    expect(sample.ok()).toBe(true)
    expect((await sample.body()).subarray(0, 4).toString()).toBe('RIFF')
  }
  for (const { file } of manifest.samples) {
    const sample = await request.get(`/samples/${file}`)
    expect(sample.ok()).toBe(true)
    expect((await sample.body()).subarray(0, 4).toString()).toBe('RIFF')
  }
  await page.reload()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

for (const [locale, play, stop, playing] of [
  ['en', 'Play', 'Stop', 'Keeping the beat'],
  ['de', 'Start', 'Stopp', 'Der Beat läuft'],
  ['ru', 'Играть', 'Стоп', 'Держим ритм'],
]) {
  test(`production playback and language persistence: ${locale}`, async ({ page }) => {
    await page.goto('/')
    await page.locator('select').first().selectOption(locale)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.locator('select').first()).toHaveValue(locale)
    await page.getByRole('checkbox').uncheck()
    await page.getByRole('switch').check()
    await page.getByRole('button', { name: play, exact: true }).click()
    await expect(page.getByText(playing, { exact: true })).toBeVisible()
    await expect(page.locator('.step.current')).toHaveCount(8)
    await page.getByRole('button', { name: stop, exact: true }).click()
    await expect(page.locator('.step.current')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
}
