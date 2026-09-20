import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { en } from './src/i18n/en'
import { PracticeGuide } from './src/PracticeGuide'

const siteUrl = 'https://drum.beep.systems/'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    {
      name: 'static-seo',
      transformIndexHtml(html) {
        const fallback = renderToStaticMarkup(
          createElement(
            'main',
            { className: 'app' },
            createElement('h1', null, en.pageTitle.split(' | ')[0]),
            createElement('p', null, en.pageDescription),
            createElement(PracticeGuide, { text: en }),
            createElement('noscript', null, 'Enable JavaScript to play and edit drum patterns.'),
          ),
        )
        return {
          html: html.replace('<!-- static-practice-guide -->', fallback),
          tags: [
            { tag: 'title', children: en.pageTitle, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'description', content: en.pageDescription } },
            { tag: 'link', attrs: { rel: 'canonical', href: siteUrl } },
            ...Object.entries({
              'og:type': 'website',
              'og:site_name': 'Drum Machine',
              'og:url': siteUrl,
              'og:title': en.pageTitle,
              'og:description': en.pageDescription,
              'og:locale': 'en_US',
            }).map(([property, content]) => ({ tag: 'meta', attrs: { property, content } })),
            ...Object.entries({
              'twitter:card': 'summary',
              'twitter:title': en.pageTitle,
              'twitter:description': en.pageDescription,
            }).map(([name, content]) => ({ tag: 'meta', attrs: { name, content } })),
            {
              tag: 'script',
              attrs: { type: 'application/ld+json' },
              children: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'WebApplication',
                name: 'Drum Machine',
                url: siteUrl,
                description: en.pageDescription,
                applicationCategory: 'MusicApplication',
                operatingSystem: 'Any',
                browserRequirements: 'Requires JavaScript and Web Audio support.',
                inLanguage: ['en', 'de', 'ru'],
                isAccessibleForFree: true,
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
              }).replace(/</g, '\\u003c'),
            },
          ],
        }
      },
    },
  ],
  test: { include: ['src/**/*.test.ts'] },
})
