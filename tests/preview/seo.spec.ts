import { expect, test } from '@playwright/test'
import { dictionaries } from '../../src/i18n'

const canonical = 'https://drum.beep.systems/'

test('production HTML is useful without JavaScript and exposes crawl metadata', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('Online Drum Machine')
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(dictionaries.en.guideHeading)
  await expect(page.getByText(dictionaries.en.guideDescription)).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
  await expect(page).toHaveTitle(dictionaries.en.pageTitle)
  const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText())
  expect(schema).toMatchObject({ '@type': 'WebApplication', url: canonical, isAccessibleForFree: true })
  const robots = await request.get('/robots.txt')
  expect(robots.ok()).toBe(true)
  expect(await robots.text()).toContain(`Sitemap: ${canonical}sitemap.xml`)
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBe(true)
  const xml = await sitemap.text()
  expect(xml).toContain(`<loc>${canonical}</loc>`)
  expect(xml.match(/<loc>/g)).toHaveLength(1)
  await context.close()
})

test('localized app keeps canonical and updates search and sharing descriptions', async ({ page }) => {
  await page.goto('/')
  for (const locale of ['en', 'de', 'ru'] as const) {
    const text = dictionaries[locale]
    await page.locator('select').first().selectOption(locale)
    await expect(page).toHaveTitle(text.pageTitle)
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: text.guideHeading })).toBeVisible()
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      await expect(page.locator(selector)).toHaveAttribute('content', text.pageDescription)
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
  }
})
