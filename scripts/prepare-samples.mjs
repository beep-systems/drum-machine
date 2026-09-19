// Run once when updating the kit. Prepared WAV files are committed; builds need no download.
import './download-samples.mjs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const selection = {
  'kick-1': 'kick_OH_FF_1.wav',
  'kick-2': 'kick_OH_FF_2.wav',
  'snare-1': 'snare_OH_FF_1.wav',
  'snare-2': 'snare_OH_FF_2.wav',
  'closed-hat': 'hihatClosed_OH_F_1.wav',
  'open-hat': 'hihatOpen_OH_F_1.wav',
  crash: 'crash1_OH_FF_1.wav',
  ride: 'ride1_OH_FF_1.wav',
  'high-tom': 'hiTom_OH_FF_1.wav',
  'low-tom': 'loTom_OH_FF_1.wav',
}
const sourceDir = '.cache/salamander'
const outputDir = 'public/samples'
await mkdir(sourceDir, { recursive: true })
await mkdir(outputDir, { recursive: true })
execFileSync('tar', [
  '-xjf',
  '.cache/salamanderDrumkit.tar.bz2',
  '-C',
  sourceDir,
  ...Object.values(selection).map((n) => `OH/${n}`),
])

function decode(bytes) {
  let channels, rate, bits, data
  for (let pos = 12; pos + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', pos, pos + 4)
    const length = bytes.readUInt32LE(pos + 4)
    if (kind === 'fmt ') {
      if (bytes.readUInt16LE(pos + 8) !== 1) throw new Error('Expected PCM WAV')
      channels = bytes.readUInt16LE(pos + 10)
      rate = bytes.readUInt32LE(pos + 12)
      bits = bytes.readUInt16LE(pos + 22)
    }
    if (kind === 'data') data = bytes.subarray(pos + 8, pos + 8 + length)
    pos += 8 + length + (length % 2)
  }
  if (!data || ![16, 24].includes(bits) || channels !== 2) throw new Error('Unexpected WAV format')
  const width = bits / 8
  const frames = data.length / width / channels
  const samples = Array.from({ length: channels }, () => new Float32Array(frames))
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++)
      samples[c][i] = data.readIntLE((i * channels + c) * width, width) / 2 ** (bits - 1)
  return { samples, frames, rate, channels }
}

const manifest = []
for (const [name, original] of Object.entries(selection)) {
  const input = await readFile(`${sourceDir}/OH/${original}`)
  const { samples, frames, rate, channels } = decode(input)
  let peak = 0
  for (const ch of samples) for (const sample of ch) peak = Math.max(peak, Math.abs(sample))
  const level = (i) => Math.max(...samples.map((ch) => Math.abs(ch[i])))
  let begin = 0,
    end = frames - 1
  while (begin < end && level(begin) < peak * 0.01) begin++
  begin = Math.max(0, begin - Math.round(rate * 0.0005))
  while (end > begin && level(end) < peak * 0.001) end--
  end = Math.min(frames - 1, end + Math.round(rate * 0.015), begin + rate * 6)
  // Keep 48 kHz; browsers resample once at decode time. Quantize to compact 16-bit PCM.
  const count = end - begin + 1
  const out = Buffer.alloc(44 + count * channels * 2)
  out.write('RIFF', 0)
  out.writeUInt32LE(out.length - 8, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(channels, 22)
  out.writeUInt32LE(rate, 24)
  out.writeUInt32LE(rate * channels * 2, 28)
  out.writeUInt16LE(channels * 2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36)
  out.writeUInt32LE(out.length - 44, 40)
  for (let i = 0; i < count; i++) {
    const fade = Math.min(1, i / (rate * 0.0003), (count - 1 - i) / (rate * 0.015))
    for (let c = 0; c < channels; c++)
      out.writeInt16LE(
        Math.round(samples[c][begin + i] * (0.8 / peak) * fade * 32767),
        44 + (i * channels + c) * 2,
      )
  }
  await writeFile(`${outputDir}/${name}.wav`, out)
  manifest.push({
    file: `${name}.wav`,
    original: `OH/${original}`,
    sourceSha256: createHash('sha256').update(input).digest('hex'),
    sha256: createHash('sha256').update(out).digest('hex'),
    trimStartFrames: begin,
    frames: count,
    sampleRate: rate,
  })
  console.log(`${name}: ${(out.length / 1024).toFixed(0)} KB, ${(count / rate).toFixed(2)} s`)
}
await writeFile(
  `${outputDir}/manifest.json`,
  JSON.stringify(
    {
      author: 'Alexander Holm',
      source: 'https://archive.org/details/SalamanderDrumkit',
      license: 'CC-BY-SA-3.0',
      modifications:
        'Trimmed leading silence (0.5 ms pre-attack), trailing silence; capped tails at 6 seconds; normalized peaks to 0.8; 0.3 ms attack / 15 ms tail fades; quantized 24-bit PCM to 16-bit PCM. Original sample rate and stereo channels preserved.',
      samples: manifest,
    },
    null,
    2,
  ) + '\n',
)
const license = await fetch('https://creativecommons.org/licenses/by-sa/3.0/legalcode.txt')
if (!license.ok) throw new Error('Could not download license text')
await writeFile(`${outputDir}/LICENSE.txt`, await license.text())
