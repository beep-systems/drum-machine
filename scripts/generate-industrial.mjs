import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Original procedural sounds; no recordings or third-party audio inputs.
const directory = fileURLToPath(new URL('../public/samples/industrial/', import.meta.url))
mkdirSync(directory, { recursive: true })
const rate = 48000
const definitions = [
  ['kick', 0.65, 52],
  ['snare', 0.4, 185],
  ['closed-hat', 0.12, 6200],
  ['open-hat', 0.8, 6200],
  ['crash', 2.4, 3100],
  ['ride', 1.4, 4300],
  ['high-tom', 0.5, 170],
  ['low-tom', 0.7, 95],
]
const samples = definitions.map(([name, duration, frequency], index) => {
  const seed = 0x1d057 + index
  let random = seed,
    phase = 0,
    previousNoise = 0,
    snareNoise = 0
  const data = new Float64Array(Math.round(duration * rate))
  for (let i = 0; i < data.length; i++) {
    const t = i / rate
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0
    const noise = random / 2147483648 - 1
    const highNoise = (noise - previousNoise) * 0.5
    previousNoise = noise
    snareNoise += 0.45 * (noise - snareNoise)
    const metal =
      [1, 1.483, 1.932, 2.546].reduce(
        (sum, ratio) => sum + Math.sin(2 * Math.PI * frequency * ratio * t),
        0,
      ) / 4
    phase += (2 * Math.PI * (frequency + frequency * 2 * Math.exp(-t * 45))) / rate
    let value
    if (name === 'kick') {
      // Drive the decaying body, rather than just its oscillator, to retain
      // weight behind the initial hit without increasing the normalized peak.
      const body = Math.sin(phase) * Math.exp(-t * 14)
      const punch = 0.24 * Math.sin(2 * phase) * Math.exp(-t * 35)
      const attack = (0.32 * highNoise + 0.18 * Math.sin(2 * Math.PI * 2400 * t)) * Math.exp(-t * 190)
      value = 0.86 * Math.tanh(4.2 * (body + punch)) + attack
    } else if (name.endsWith('tom')) {
      const body = (Math.sin(phase) + 0.16 * Math.sin(2.03 * phase)) * Math.exp((-t * 6) / duration)
      value = 0.9 * Math.tanh(3.2 * body) + 0.16 * highNoise * Math.exp(-t * 120)
    } else if (name === 'snare') {
      const body = (Math.sin(phase) + 0.35 * Math.sin(phase * 1.47)) * Math.exp(-t * 26)
      const crack = (0.7 * highNoise + 0.3 * metal) * Math.exp(-t * 100)
      value =
        0.52 * Math.tanh(3.2 * body) + 0.68 * Math.tanh(3.5 * snareNoise) * Math.exp(-t * 16) + 0.36 * crack
    } else {
      // More metallic sustain and a short noise attack, without driving the
      // high-frequency partials into additional aliased harmonics.
      value =
        (0.42 * highNoise + 0.58 * metal) * Math.exp((-t * 4.8) / duration) +
        0.16 * highNoise * Math.exp(-t * 100)
    }
    data[i] = value * Math.min(1, t / 0.0005) * Math.min(1, (data.length - 1 - i) / (rate * 0.015))
  }
  const peak = data.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
  const wav = Buffer.alloc(44 + data.length * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(data.length * 2, 40)
  data.forEach((value, i) => wav.writeInt16LE(Math.round((value / peak) * 0.8 * 32767), 44 + i * 2))
  writeFileSync(`${directory}/${name}.wav`, wav)
  return {
    file: `${name}.wav`,
    seed,
    frequency,
    frames: data.length,
    sampleRate: rate,
    sha256: createHash('sha256').update(wav).digest('hex'),
  }
})
writeFileSync(
  `${directory}/manifest.json`,
  JSON.stringify(
    {
      source: 'Original procedural synthesis in scripts/generate-industrial.mjs; no third-party samples.',
      license: 'CC0-1.0',
      channels: 1,
      bitsPerSample: 16,
      peak: 0.8,
      revision: 2,
      processing:
        'Seeded noise; driven decaying kick/tom bodies with harmonic punch and short noise attacks; saturated snare body and filtered noise; metallic cymbal sustain; 0.5 ms attack, 15 ms end fade; peak normalization to 0.8.',
      samples,
    },
    null,
    2,
  ) + '\n',
)
