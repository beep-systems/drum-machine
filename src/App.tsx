import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { DrumEngine } from './audio/engine'
import {
  editStep,
  emptyPattern,
  initialState,
  PRESETS,
  TRACKS,
  type AppState,
  type SavedPattern,
  type Session,
  type TrackId,
} from './model'
import { exportLibrary, importLibrary, restoreState, saveState } from './storage'

function Icon({
  name,
  size = 20,
}: {
  name: 'play' | 'stop' | 'sound' | 'mute' | 'save' | 'download' | 'upload' | 'trash'
  size?: number
}) {
  const paths = {
    play: <path d="m8 4 13 8-13 8Z" fill="currentColor" stroke="none" />,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none" />,
    sound: (
      <>
        <path d="M11 4 5 9H2v6h3l6 5Z" />
        <path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="M11 4 5 9H2v6h3l6 5Z" />
        <path d="m16 9 6 6m0-6-6 6" />
      </>
    ),
    save: (
      <>
        <path d="M5 3h12l4 4v14H3V3Z" />
        <path d="M7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function readInitial() {
  try {
    return restoreState(window.localStorage)
  } catch {
    return {
      state: initialState(),
      warning: 'Хранилище браузера недоступно. Настройки не сохраняются; используй экспорт ритмов.',
    }
  }
}

export function App() {
  const [boot] = useState(readInitial)
  const [state, setState] = useState<AppState>(boot.state)
  const stateRef = useRef(state)
  stateRef.current = state
  const [engine] = useState(() => new DrumEngine())
  const sound = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const [position, setPosition] = useState({ step: -1, beat: 0, bpm: state.session.bpm })
  const [warning, setWarning] = useState(boot.warning)
  const [notice, setNotice] = useState('')
  const [saveName, setSaveName] = useState('')
  const [focusedCell, setFocusedCell] = useState(0)
  const [tempoText, setTempoText] = useState(String(state.session.bpm))
  const fileInput = useRef<HTMLInputElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const session = state.session
  const busy = sound.status !== 'idle' && sound.status !== 'error'
  const preparing = sound.status === 'loading' || sound.status === 'rendering'

  function changeSession(change: Partial<Session>) {
    setState((old) => ({ ...old, session: { ...old.session, ...change } }))
  }
  function setBpm(value: number) {
    const bpm = Math.max(40, Math.min(300, Math.round(value)))
    if (Number.isFinite(bpm)) {
      changeSession({ bpm })
      setTempoText(String(bpm))
    }
  }
  function selectPattern(saved: SavedPattern) {
    changeSession({ pattern: structuredClone(saved.pattern), bpm: saved.bpm })
    setTempoText(String(saved.bpm))
    setNotice('')
  }
  function toggle() {
    if (busy) engine.stop()
    else void engine.start(session.pattern, session.bpm, session.countIn)
  }

  useEffect(() => {
    if (boot.warning) return
    const timer = window.setTimeout(() => {
      try {
        if (!saveState(window.localStorage, state))
          setWarning(
            'Настройки не сохраняются: хранилище браузера недоступно или заполнено. Экспортируй ритмы в файл.',
          )
        else setWarning('')
      } catch {
        setWarning('Хранилище недоступно. Экспортируй ритмы, чтобы не потерять изменения.')
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [state, boot.warning])
  useEffect(() => {
    engine.setMix(session.mixer, session.master)
  }, [engine, session.mixer, session.master])
  useEffect(() => {
    engine.update(session.pattern, session.bpm)
  }, [engine, session.pattern, session.bpm])
  useEffect(() => {
    if (!busy) {
      setPosition({ step: -1, beat: 0, bpm: session.bpm })
      return
    }
    let frame: number
    const tick = () => {
      const next = engine.position()
      setPosition((prev) =>
        prev.step === next.step && prev.beat === next.beat && prev.bpm === next.bpm ? prev : next,
      )
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [busy, engine, session.bpm])
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.code === 'Space' &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !target.closest('input, textarea, select, button, a, [contenteditable="true"]')
      ) {
        event.preventDefault()
        if (engine.getSnapshot().status === 'idle' || engine.getSnapshot().status === 'error')
          void engine.start(session.pattern, session.bpm, session.countIn)
        else engine.stop()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [engine, session.pattern, session.bpm, session.countIn])
  useEffect(() => () => engine.dispose(), [engine])
  useEffect(() => {
    const flush = () => {
      if (boot.warning) return
      try {
        saveState(window.localStorage, stateRef.current)
      } catch {
        /* Already shown in the UI. */
      }
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [boot.warning])

  function changeStep(track: TrackId, step: number, accent: boolean) {
    const pattern = structuredClone(session.pattern)
    pattern.tracks[track][step] = editStep(pattern.tracks[track][step], accent)
    changeSession({ pattern })
  }
  function gridKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const directions: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 32, ArrowUp: -32 }
    if (!(event.key in directions)) return
    event.preventDefault()
    const next = Math.max(0, Math.min(255, index + directions[event.key]))
    setFocusedCell(next)
    grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus()
  }
  function savePattern() {
    const name = saveName.trim()
    if (!name) {
      setNotice('Дай ритму имя перед сохранением.')
      return
    }
    if (state.library.length >= 128) {
      setNotice('Библиотека заполнена: максимум 128 ритмов.')
      return
    }
    const pattern = { ...structuredClone(session.pattern), name }
    // crypto.randomUUID is unavailable on HTTP LAN origins in some browsers.
    const id = `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    setState((old) => ({
      ...old,
      library: [...old.library, { id, pattern, bpm: old.session.bpm }],
      session: { ...old.session, pattern },
    }))
    setSaveName('')
    setNotice(`«${name}» сохранён в библиотеке.`)
  }
  function download() {
    const blob = new Blob([exportLibrary(state.library)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'drum-machine-library.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function upload(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 1_000_000) throw new Error('Файл слишком большой: максимум 1 МБ.')
      const raw = await file.text()
      const library = importLibrary(raw, stateRef.current.library)
      setState((old) => ({ ...old, library }))
      setNotice('Библиотека импортирована. Одинаковые ритмы не дублируются.')
    } catch (error) {
      setNotice((error as Error).message)
    }
    if (fileInput.current) fileInput.current.value = ''
  }
  const statusText =
    sound.status === 'loading'
      ? 'Загружаем установку…'
      : sound.status === 'rendering'
        ? 'Готовим ритм…'
        : sound.status === 'countin'
          ? `Приготовься · ${position.beat || 1} / 4`
          : sound.status === 'playing'
            ? 'Держим ритм'
            : sound.status === 'error'
              ? 'Нужен повторный запуск'
              : 'Готов к репетиции'

  return (
    <main className="app">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Drum Machine — главная">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>{' '}
          DRUM<span className="brand-light">MACHINE</span>
          <span className="version">01</span>
        </a>
        <span className="output-label">
          <span className="status-dot" /> Звук на этом устройстве
        </span>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">ТВОЙ НАПАРНИК ПО РЕПЕТИЦИИ</p>
          <h1>
            Включай ритм.
            <br />
            <span>Играй громче.</span>
          </h1>
          <p className="intro-copy">
            Живые ударные для твоих риффов.
            <br className="mobile-only" /> От первого аккорда до двойной бочки.
          </p>
        </div>
        <div className="intro-art" aria-hidden="true">
          <div className="art-ring ring-one" />
          <div className="art-ring ring-two" />
          <div className="art-stick stick-one" />
          <div className="art-stick stick-two" />
          <span className="art-label">ACOUSTIC KIT / VOL. 01</span>
          <span className="art-cross">+</span>
        </div>
      </section>

      <section className="transport panel" aria-label="Управление воспроизведением">
        <div className="play-section">
          <button
            className={`play-button ${busy ? 'is-playing' : ''}`}
            onClick={toggle}
            aria-label={busy ? 'Стоп' : 'Играть'}
          >
            <Icon name={busy ? 'stop' : 'play'} size={25} />
            {busy ? 'Стоп' : 'Играть'}
          </button>
          <span className="key-hint">
            <kbd>пробел</kbd> старт / стоп
          </span>
        </div>
        <div className="tempo-section">
          <label className="control-label" htmlFor="tempo">
            ТЕМП
          </label>
          <div className="tempo-value">
            <button className="adjust" aria-label="Уменьшить темп" onClick={() => setBpm(session.bpm - 1)}>
              −
            </button>
            <input
              id="tempo"
              type="number"
              min="40"
              max="300"
              value={tempoText}
              onChange={(e) => {
                setTempoText(e.target.value)
                const v = Number(e.target.value)
                if (Number.isInteger(v) && v >= 40 && v <= 300) changeSession({ bpm: v })
              }}
              onBlur={() => setBpm(Number(tempoText) || session.bpm)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
            <span>BPM</span>
            <button className="adjust" aria-label="Увеличить темп" onClick={() => setBpm(session.bpm + 1)}>
              +
            </button>
          </div>
          <input
            aria-label="Темп"
            className="tempo-slider"
            type="range"
            min="40"
            max="300"
            value={session.bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
        </div>
        <div className="volume-section">
          <label className="control-label" htmlFor="master">
            ГРОМКОСТЬ <span>{Math.round(session.master * 100)}%</span>
          </label>
          <div className="volume-control">
            <Icon name={session.master === 0 ? 'mute' : 'sound'} />
            <input
              id="master"
              type="range"
              min="0"
              max="100"
              value={Math.round(session.master * 100)}
              onChange={(e) => changeSession({ master: Number(e.target.value) / 100 })}
            />
          </div>
          <label className="count-in">
            <input
              type="checkbox"
              checked={session.countIn}
              onChange={(e) => changeSession({ countIn: e.target.checked })}
            />
            <span className="toggle-switch" />
            Отсчёт перед стартом <span className="subtle">1 такт</span>
          </label>
        </div>
        <div className="transport-status">
          <div className={`beat-lights ${busy ? 'running' : ''}`} aria-hidden="true">
            {[0, 1, 2, 3].map((beat) => (
              <i
                key={beat}
                className={
                  sound.status === 'countin'
                    ? position.beat - 1 === beat
                      ? 'lit'
                      : ''
                    : position.step >= 0 && Math.floor(position.step / 4) % 4 === beat
                      ? 'lit'
                      : ''
                }
              />
            ))}
          </div>
          <span role="status">{statusText}</span>
          <span className="timing-label">
            4/4 <b>·</b> 2 такта <b>·</b> 1/16
          </span>
        </div>
      </section>
      {sound.error && (
        <div className="alert error" role="alert">
          {sound.error}
        </div>
      )}
      {warning && (
        <div className="alert" role="alert">
          {warning}
        </div>
      )}

      <section className="presets-section" aria-labelledby="presets-heading">
        <div className="section-heading">
          <h2 id="presets-heading">
            <span className="section-number">01</span> Начни с ритма
          </h2>
          <span className="section-note">Выбери характер. Темп — за тобой.</span>
        </div>
        <div className="presets">
          {PRESETS.map((preset, i) => {
            const selected = JSON.stringify(preset.pattern.tracks) === JSON.stringify(session.pattern.tracks)
            return (
              <button
                key={preset.id}
                className={`preset ${selected ? 'selected' : ''}`}
                onClick={() => selectPattern(preset)}
                aria-pressed={selected}
              >
                <span className="preset-top">
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span>{preset.bpm} BPM</span>
                </span>
                <strong>{preset.pattern.name}</strong>
                <span className="mini-pattern" aria-hidden="true">
                  {Array.from({ length: 16 }, (_, s) => (
                    <i
                      key={s}
                      className={
                        preset.pattern.tracks.kick[s] ? 'kick' : preset.pattern.tracks.snare[s] ? 'snare' : ''
                      }
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="editor panel" aria-labelledby="editor-heading">
        <div className="editor-header">
          <div>
            <p className="eyebrow">ШАГОВЫЙ СЕКВЕНСОР</p>
            <h2 id="editor-heading">{session.pattern.name}</h2>
          </div>
          <div className="editor-actions">
            {sound.pending && (
              <span className="pending" role="status">
                Изменения со следующего цикла
              </span>
            )}
            <button
              className="text-button"
              onClick={() => changeSession({ pattern: emptyPattern('Новый ритм') })}
            >
              <Icon name="trash" size={16} />
              Очистить сетку
            </button>
          </div>
        </div>
        <div className="grid-scroll" ref={grid}>
          <div className="sequencer">
            <div className="grid-header">
              <span className="track-caption">ИНСТРУМЕНТ / МИКШЕР</span>
              <div className="bar-labels">
                <span>ТАКТ 1</span>
                <span>ТАКТ 2</span>
              </div>
            </div>
            <div className="grid-header counts">
              <span className="track-caption">Нажми на имя, чтобы послушать</span>
              <div className="steps">
                {Array.from({ length: 32 }, (_, step) => (
                  <span
                    className={`${step % 4 === 0 ? 'downbeat' : ''} ${step === position.step ? 'current-count' : ''}`}
                    key={step}
                  >
                    {step % 4 === 0 ? (Math.floor(step / 4) % 4) + 1 : '·'}
                  </span>
                ))}
              </div>
            </div>
            {TRACKS.map((track, row) => (
              <div
                className={`track-row ${session.mixer[track.id].muted ? 'muted' : ''}`}
                key={track.id}
                style={{ '--track-color': track.color } as CSSProperties}
              >
                <div className="track-controls">
                  <button
                    className="instrument"
                    onClick={() => void engine.preview(track.id)}
                    aria-label={`Прослушать: ${track.name}`}
                  >
                    <span className="instrument-code">{track.short}</span>
                    <span>{track.name}</span>
                  </button>
                  <div className="track-mix">
                    <button
                      className={`mute-button ${session.mixer[track.id].muted ? 'on' : ''}`}
                      aria-label={`Выключить: ${track.name}`}
                      aria-pressed={session.mixer[track.id].muted}
                      onClick={() =>
                        changeSession({
                          mixer: {
                            ...session.mixer,
                            [track.id]: { ...session.mixer[track.id], muted: !session.mixer[track.id].muted },
                          },
                        })
                      }
                    >
                      {session.mixer[track.id].muted ? 'M' : <Icon name="sound" size={13} />}
                    </button>
                    <input
                      aria-label={`Громкость: ${track.name}`}
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(session.mixer[track.id].volume * 100)}
                      onChange={(e) =>
                        changeSession({
                          mixer: {
                            ...session.mixer,
                            [track.id]: { ...session.mixer[track.id], volume: Number(e.target.value) / 100 },
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="steps">
                  {session.pattern.tracks[track.id].map((value, step) => (
                    <button
                      key={step}
                      data-cell={row * 32 + step}
                      data-value={value}
                      aria-label={`${track.name}: такт ${Math.floor(step / 16) + 1}, шаг ${(step % 16) + 1}${value === 2 ? ', акцент' : ''}`}
                      aria-pressed={value > 0}
                      tabIndex={focusedCell === row * 32 + step ? 0 : -1}
                      onFocus={() => setFocusedCell(row * 32 + step)}
                      onKeyDown={(e) => gridKeys(e, row * 32 + step)}
                      onClick={(e) => changeStep(track.id, step, e.shiftKey)}
                      className={`step ${value ? 'active' : ''} ${value === 2 ? 'accent' : ''} ${step % 4 === 0 ? 'beat-start' : ''} ${step === 16 ? 'bar-start' : ''} ${step === position.step ? 'current' : ''}`}
                    >
                      <span>{value === 2 ? '•' : ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="editor-footer">
          <div className="legend">
            <span>
              <i className="legend-hit" /> Удар
            </span>
            <span>
              <i className="legend-accent" /> Акцент
            </span>
          </div>
          <span>
            Клик — удар <b>·</b> Shift + клик — акцент <b>·</b> Стрелки — навигация
          </span>
        </div>
      </section>

      <section className="library panel" aria-labelledby="library-heading">
        <div className="library-heading">
          <div>
            <p className="eyebrow">СОХРАНИ СВОЙ ЗВУК</p>
            <h2 id="library-heading">
              Мои ритмы <span className="library-count">{state.library.length}</span>
            </h2>
          </div>
          <div className="library-tools">
            <button className="text-button" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" size={16} />
              Импорт
            </button>
            <button className="text-button" onClick={download} disabled={!state.library.length}>
              <Icon name="download" size={16} />
              Экспорт
            </button>
            <input
              ref={fileInput}
              className="hidden-input"
              type="file"
              accept="application/json,.json"
              aria-label="Импорт библиотеки"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </div>
        </div>
        <form
          className="save-form"
          onSubmit={(e) => {
            e.preventDefault()
            savePattern()
          }}
        >
          <input
            aria-label="Название ритма"
            placeholder="Например, рифф в ми миноре"
            maxLength={60}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
          />
          <button className="secondary-button" type="submit">
            <Icon name="save" size={17} />
            Сохранить ритм
          </button>
        </form>
        {state.library.length ? (
          <div className="saved-list">
            {state.library.map((item) => (
              <div className="saved-item" key={item.id}>
                <button onClick={() => selectPattern(item)}>
                  <span className="saved-icon">♫</span>
                  <strong>{item.pattern.name}</strong>
                  <span>{item.bpm} BPM</span>
                </button>
                <button
                  className="delete-saved"
                  aria-label={`Удалить ритм: ${item.pattern.name}`}
                  onClick={() => {
                    setState((old) => ({ ...old, library: old.library.filter((p) => p.id !== item.id) }))
                    setNotice(`Ритм «${item.pattern.name}» удалён из библиотеки.`)
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-library">
            Здесь будут твои ритмы. Сохрани первый — и возвращайся к нему на следующей репетиции.
          </p>
        )}
        <p className={`library-notice ${notice ? 'visible' : ''}`} role="status">
          {notice || 'Настройки автоматически сохраняются в этом браузере.'}
        </p>
      </section>

      <footer className="footer">
        <span className="footer-brand">
          DRUM MACHINE <span>/</span> СДЕЛАНО ДЛЯ ПРАКТИКИ
        </span>
        <span>
          Сэмплы:{' '}
          <a href="/samples/README.md" target="_blank" rel="noreferrer">
            Salamander · CC BY-SA 3.0
          </a>
        </span>
      </footer>
      {preparing && (
        <span className="sr-only" role="status">
          Подготовка аудио. Кнопка «Стоп» отменяет запуск.
        </span>
      )}
    </main>
  )
}
