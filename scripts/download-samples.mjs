import { mkdir, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

await mkdir('.cache', { recursive: true })
const target = '.cache/salamanderDrumkit.tar.bz2'
if ((await stat(target).catch(() => null))?.size === 387611727) {
  console.log('Archive already downloaded.')
} else {
  const response = await fetch('https://archive.org/download/SalamanderDrumkit/salamanderDrumkit.tar.bz2')
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
  console.log('Downloaded Salamander Drumkit:', (await stat(target)).size, 'bytes')
}
