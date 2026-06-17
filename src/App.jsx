import { useEffect, useMemo, useState } from 'react'
import './App.css'

const DENVER_TZ = 'America/Denver'
const ISTANBUL_TZ = 'Europe/Istanbul'

const cities = {
  denver: {
    label: 'Denver',
    country: 'USA',
    zone: DENVER_TZ,
    accent: 'MST / MDT',
  },
  istanbul: {
    label: 'Istanbul',
    country: 'Turkey',
    zone: ISTANBUL_TZ,
    accent: 'TRT',
  },
}

const formatterCache = new Map()

function getFormatter(timeZone, options) {
  const key = `${timeZone}-${JSON.stringify(options)}`

  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        ...options,
      }),
    )
  }

  return formatterCache.get(key)
}

function getZonedParts(date, timeZone) {
  const parts = getFormatter(timeZone, {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  )

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour === '24' ? '0' : values.hour),
    minute: Number(values.minute),
  }
}

function formatTime(date, timeZone, includeSeconds = false) {
  return getFormatter(timeZone, {
    hour: 'numeric',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: true,
  }).format(date)
}

function formatDate(date, timeZone) {
  return getFormatter(timeZone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatOffset(date, timeZone) {
  const value = getFormatter(timeZone, {
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value

  return value?.replace('GMT', 'UTC') ?? ''
}

function parseInputValue(value) {
  if (!value || !value.includes('T')) return null

  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const values = [year, month, day, hour, minute]

  if (values.some((item) => Number.isNaN(item))) return null

  return { year, month, day, hour, minute }
}

function localDateTimeToInstant(value, timeZone) {
  const target = parseInputValue(value)
  if (!target) return null

  let guess = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute)

  for (let index = 0; index < 4; index += 1) {
    const actual = getZonedParts(new Date(guess), timeZone)
    const targetUtc = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
    )
    const actualUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    )
    const diff = targetUtc - actualUtc

    if (diff === 0) break
    guess += diff
  }

  return new Date(guess)
}

function toInputValue(date, timeZone) {
  const parts = getZonedParts(date, timeZone)
  const pad = (value) => String(value).padStart(2, '0')

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

function getInputParts(value) {
  const [date = '', time = ''] = value.split('T')
  return { date, time }
}

function updateInputPart(value, part, nextValue) {
  const current = getInputParts(value)
  const next = {
    ...current,
    [part]: nextValue,
  }

  if (!next.date && !next.time) return ''
  return `${next.date}T${next.time}`
}

function getHour(date, timeZone) {
  return getZonedParts(date, timeZone).hour
}

function getOverlapStatus(date) {
  const denverHour = getHour(date, DENVER_TZ)
  const istanbulHour = getHour(date, ISTANBUL_TZ)
  const denverAwake = denverHour >= 8 && denverHour < 23
  const istanbulAwake = istanbulHour >= 8 && istanbulHour < 23
  const denverCozy = denverHour >= 10 && denverHour < 22
  const istanbulCozy = istanbulHour >= 10 && istanbulHour < 22

  if (denverCozy && istanbulCozy) {
    return { tone: 'great', label: 'Great window', note: 'Both cities are in a comfortable daytime or evening window.' }
  }

  if (denverAwake && istanbulAwake) {
    return { tone: 'ok', label: 'Possible', note: 'Both cities should be awake, but one side may be early or late.' }
  }

  return { tone: 'late', label: 'Quiet hours', note: 'One city is likely outside a normal awake window.' }
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function CityClock({ city, now }) {
  return (
    <article className="clock-card">
      <div className="clock-topline">
        <span>{city.country}</span>
        <span>{formatOffset(now, city.zone)}</span>
      </div>
      <h2>{city.label}</h2>
      <p className="clock-time">{formatTime(now, city.zone, true)}</p>
      <p className="clock-date">
        {formatDate(now, city.zone)} · {city.accent}
      </p>
    </article>
  )
}

function ConversionPanel({
  title,
  source,
  target,
  value,
  onChange,
  convertedDate,
}) {
  const status = convertedDate
    ? getOverlapStatus(convertedDate)
    : { tone: 'late', label: 'Needs time', note: 'Enter a complete date and time.' }
  const inputParts = getInputParts(value)

  return (
    <article className="converter-panel">
      <div>
        <p className="panel-kicker">{title}</p>
        <h3>
          When it is {source.label}
        </h3>
      </div>
      <div className="date-time-control" aria-label={`${source.label} date and time`}>
        <label>
          <span>Date</span>
          <input
            type="date"
            value={inputParts.date}
            onChange={(event) => onChange(updateInputPart(value, 'date', event.target.value))}
            onInput={(event) => onChange(updateInputPart(value, 'date', event.target.value))}
          />
        </label>
        <label>
          <span>Time</span>
          <input
            type="time"
            value={inputParts.time}
            onChange={(event) => onChange(updateInputPart(value, 'time', event.target.value))}
            onInput={(event) => onChange(updateInputPart(value, 'time', event.target.value))}
          />
        </label>
        <button type="button" onClick={() => onChange(toInputValue(new Date(), source.zone))}>
          Now
        </button>
      </div>
      <div className="result-box">
        <span>It is {target.label}</span>
        {convertedDate ? (
          <>
            <strong>{formatTime(convertedDate, target.zone)}</strong>
            <small>{formatDate(convertedDate, target.zone)}</small>
          </>
        ) : (
          <>
            <strong>--:--</strong>
            <small>Waiting for a valid time</small>
          </>
        )}
      </div>
      <div className={`status-pill ${status.tone}`}>
        <span>{status.label}</span>
        <small>{status.note}</small>
      </div>
    </article>
  )
}

function App() {
  const [now, setNow] = useState(() => new Date())
  const [denverInput, setDenverInput] = useState(() => toInputValue(new Date(), DENVER_TZ))
  const [istanbulInput, setIstanbulInput] = useState(() => toInputValue(new Date(), ISTANBUL_TZ))

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const denverConverted = useMemo(
    () => localDateTimeToInstant(denverInput, DENVER_TZ),
    [denverInput],
  )
  const istanbulConverted = useMemo(
    () => localDateTimeToInstant(istanbulInput, ISTANBUL_TZ),
    [istanbulInput],
  )

  const timeline = useMemo(() => {
    const rounded = new Date(now)
    rounded.setMinutes(0, 0, 0)

    return Array.from({ length: 10 }, (_, index) => addHours(rounded, index + 1))
  }, [now])

  const currentStatus = getOverlapStatus(now)

  return (
    <main className="app-shell">
      <section className="hero-section">
        <nav className="nav-bar" aria-label="Primary">
          <div className="brand-block">
            <div className="brand-mark">TT</div>
            <span>Time Together</span>
          </div>
          <a href="#converter">Check a time</a>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="section-label">Denver · Istanbul</p>
            <h1>Two cities, one shared time.</h1>
            <p>
              Compare Denver and Istanbul with a warmer time-zone view for calls,
              messages, family plans, and everyday check-ins.
            </p>
            <div className="hero-meta" aria-label="Supported time zones">
              <span>Comfortable overlap</span>
              <span>Quiet-hour awareness</span>
            </div>
          </div>

          <div className="live-clocks" aria-label="Live city clocks">
            <CityClock city={cities.denver} now={now} />
            <CityClock city={cities.istanbul} now={now} />
          </div>
        </div>
      </section>

      <section className="status-strip" aria-label="Current overlap status">
        <div>
          <span className={`status-dot ${currentStatus.tone}`}></span>
          <strong>{currentStatus.label} right now</strong>
        </div>
        <p>{currentStatus.note}</p>
      </section>

      <section id="converter" className="converter-grid">
        <ConversionPanel
          title="From Colorado"
          source={cities.denver}
          target={cities.istanbul}
          value={denverInput}
          onChange={setDenverInput}
          convertedDate={denverConverted}
        />
        <ConversionPanel
          title="From Turkey"
          source={cities.istanbul}
          target={cities.denver}
          value={istanbulInput}
          onChange={setIstanbulInput}
          convertedDate={istanbulConverted}
        />
      </section>

      <section className="timeline-section">
        <div className="section-heading">
          <p className="section-label">Coming up</p>
          <h2>Upcoming time windows</h2>
        </div>

        <div className="timeline-list">
          {timeline.map((date) => {
            const status = getOverlapStatus(date)

            return (
              <div className="timeline-row" key={date.toISOString()}>
                <div>
                  <strong>{formatTime(date, DENVER_TZ)}</strong>
                  <span>Denver</span>
                </div>
                <div className="time-bridge"></div>
                <div>
                  <strong>{formatTime(date, ISTANBUL_TZ)}</strong>
                  <span>Istanbul</span>
                </div>
                <span className={`row-status ${status.tone}`}>{status.label}</span>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export default App
