# Salamander Drumkit — Drum Machine selection

Original drum kit and recordings by **Alexander Holm**.

- Source: [Salamander Drumkit on Internet Archive](https://archive.org/details/SalamanderDrumkit).
- Description and SFZ: [endolith/Salamander-Drumkit](https://github.com/endolith/Salamander-Drumkit).
- Original and processed sample license: **CC BY-SA 3.0** — [license summary](https://creativecommons.org/licenses/by-sa/3.0/).
- Full license text: [LICENSE.txt](./LICENSE.txt).

Ten stereo acoustic recordings: two kicks, two snares, closed and open hi-hat, crash, ride and two toms.

Processing: removed leading silence while keeping 0.5 ms before the attack; removed trailing silence; limited tails to 6 seconds; normalized peaks to 0.8; applied 0.3 ms / 15 ms edge fades; converted 24-bit PCM to 16-bit PCM. Original 48 kHz sample rate and stereo channels are preserved.

Modifications by the Drum Machine contributors. Original file names, checksums and processing parameters are in [manifest.json](./manifest.json). Reproduce the processing with `npm run samples:prepare` from the project root; Node.js 24 and `tar` with bzip2 support are required. The source archive (~370 MiB) is not part of the app or Docker image.

Keep attribution, the license and the description of changes when redistributing this selection. Modified samples are distributed under CC BY-SA 3.0. The sample license is not a statement about the license of the entire application's source code.
