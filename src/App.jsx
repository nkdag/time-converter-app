import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import './App.css'

const DENVER_TZ = 'America/Denver'
const ISTANBUL_TZ = 'Europe/Istanbul'
const TIME_FORMATS = {
  TWELVE: '12h',
  TWENTY_FOUR: '24h',
}
const CITY_KEYS = {
  DENVER: 'denver',
  ISTANBUL: 'istanbul',
}

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

const directions = [
  { source: CITY_KEYS.DENVER, target: CITY_KEYS.ISTANBUL, label: 'Denver to Istanbul' },
  { source: CITY_KEYS.ISTANBUL, target: CITY_KEYS.DENVER, label: 'Istanbul to Denver' },
]

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

function getZonedWeekday(date, timeZone) {
  const value = getFormatter(timeZone, {
    weekday: 'short',
  }).format(date)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value)
}

function formatTime(date, timeZone, includeSeconds = false, timeFormat = TIME_FORMATS.TWELVE) {
  const use24Hour = timeFormat === TIME_FORMATS.TWENTY_FOUR

  return getFormatter(timeZone, {
    hour: use24Hour ? '2-digit' : 'numeric',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: !use24Hour,
    hourCycle: use24Hour ? 'h23' : undefined,
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
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null

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
  return inputFromParts(parts)
}

function inputFromParts(parts) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

function inputFromDateAndTime(dateParts, hour, minute = 0) {
  return inputFromParts({
    ...dateParts,
    hour,
    minute,
  })
}

function addDaysToParts(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function getInputParts(value) {
  const [date = '', time = ''] = value.split('T')
  return { date, time }
}

function getTimeControlParts(value) {
  const { time } = getInputParts(value)
  const [rawHour = '0', rawMinute = '0'] = time.split(':')
  const hour24 = Math.min(23, Math.max(0, Number(rawHour) || 0))
  const minute = Math.min(59, Math.max(0, Number(rawMinute) || 0))

  return {
    hour: String(hour24).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
  }
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

function updateTimePart(value, part, nextValue) {
  const { date, time } = getInputParts(value)
  const [rawHour = '0', rawMinute = '0'] = time.split(':')
  const currentHour = Math.min(23, Math.max(0, Number(rawHour) || 0))
  const currentMinute = Math.min(59, Math.max(0, Number(rawMinute) || 0))
  const nextDigits = String(nextValue).replace(/\D/g, '')
  let nextHour = currentHour
  let nextMinute = currentMinute

  if (part === 'hour') {
    const fallback = currentHour
    const parsed = Number(nextDigits || fallback)
    nextHour = Math.min(23, Math.max(0, Number.isNaN(parsed) ? fallback : parsed))
  }

  if (part === 'minute') {
    const parsed = Number(nextDigits || currentMinute)
    nextMinute = Math.min(59, Math.max(0, Number.isNaN(parsed) ? currentMinute : parsed))
  }

  const pad = (item) => String(item).padStart(2, '0')
  return `${date}T${pad(nextHour)}:${pad(nextMinute)}`
}

function getHour(date, timeZone) {
  return getZonedParts(date, timeZone).hour
}

function getOverlapStatus(date) {
  const denverHour = getHour(date, DENVER_TZ)
  const istanbulHour = getHour(date, ISTANBUL_TZ)
  const denverAwake = denverHour >= 8 && denverHour < 23
  const istanbulAwake = istanbulHour >= 8 && istanbulHour < 23
  const denverComfortable = denverHour >= 9 && denverHour < 22
  const istanbulComfortable = istanbulHour >= 9 && istanbulHour < 22

  if (denverComfortable && istanbulComfortable) {
    return { tone: 'great', label: 'Good for both', note: 'Both cities are in a comfortable window.' }
  }

  if (istanbulHour < 8) {
    return { tone: 'late', label: 'Too early in Istanbul', note: 'Istanbul is likely too early.' }
  }

  if (istanbulHour >= 23) {
    return { tone: 'late', label: 'Late in Istanbul', note: 'Istanbul is likely late.' }
  }

  if (denverHour < 8) {
    return { tone: 'late', label: 'Too early in Denver', note: 'Denver is likely too early.' }
  }

  if (denverHour >= 23) {
    return { tone: 'late', label: 'Late in Denver', note: 'Denver is likely late.' }
  }

  if (denverAwake && istanbulAwake) {
    return { tone: 'ok', label: 'Possible', note: 'Both cities should be awake.' }
  }

  return { tone: 'late', label: 'Possible', note: 'One city is outside a usual awake window.' }
}

function getInitialState() {
  const fallbackSource = CITY_KEYS.DENVER
  const fallbackFormat = TIME_FORMATS.TWELVE
  const fallbackInput = toInputValue(new Date(), cities[fallbackSource].zone)

  if (typeof window === 'undefined') {
    return {
      sourceKey: fallbackSource,
      timeFormat: fallbackFormat,
      inputValue: fallbackInput,
    }
  }

  const params = new URLSearchParams(window.location.search)
  const sourceKey = Object.hasOwn(cities, params.get('from') ?? '')
    ? params.get('from')
    : fallbackSource
  const timeFormat = Object.values(TIME_FORMATS).includes(params.get('format'))
    ? params.get('format')
    : fallbackFormat
  const rawInput = params.get('at')
  const inputValue =
    rawInput && parseInputValue(rawInput) ? rawInput : toInputValue(new Date(), cities[sourceKey].zone)

  return {
    sourceKey,
    timeFormat,
    inputValue,
  }
}

function shortcutInput(shortcut, sourceZone) {
  const now = new Date()
  const today = getZonedParts(now, sourceZone)
  const todayDate = { year: today.year, month: today.month, day: today.day }

  if (shortcut === 'now') return toInputValue(now, sourceZone)
  if (shortcut === 'tonight') return inputFromDateAndTime(todayDate, 20)
  if (shortcut === 'tomorrow') return inputFromDateAndTime(addDaysToParts(todayDate, 1), 9)

  const weekday = getZonedWeekday(now, sourceZone)
  const daysUntilSaturday = weekday === -1 ? 0 : (6 - weekday + 7) % 7
  return inputFromDateAndTime(addDaysToParts(todayDate, daysUntilSaturday), 11)
}

function getBestSuggestions(inputValue, sourceKey) {
  const source = cities[sourceKey]
  const targetKey = sourceKey === CITY_KEYS.DENVER ? CITY_KEYS.ISTANBUL : CITY_KEYS.DENVER
  const target = cities[targetKey]
  const parsed = parseInputValue(inputValue)
  const dateParts = parsed
    ? { year: parsed.year, month: parsed.month, day: parsed.day }
    : getZonedParts(new Date(), source.zone)

  const scored = Array.from({ length: 17 }, (_, index) => index + 6)
    .map((hour) => {
      const value = inputFromDateAndTime(dateParts, hour)
      const instant = localDateTimeToInstant(value, source.zone)
      const status = instant ? getOverlapStatus(instant) : null
      const targetHour = instant ? getHour(instant, target.zone) : 0
      const score =
        (status?.tone === 'great' ? 3 : 0) +
        (status?.tone === 'ok' ? 1 : 0) -
        Math.abs(targetHour - 19) / 10

      return { value, instant, status, score }
    })
    .filter((item) => item.instant)
    .sort((left, right) => right.score - left.score)

  return scored.slice(0, 3).map((item) => ({
    ...item,
    source,
    target,
  }))
}

function CityClock({ city, now, timeFormat }) {
  return (
    <Card className="clock-card">
      <div className="clock-topline">
        <span>{city.country}</span>
        <span>{formatOffset(now, city.zone)}</span>
      </div>
      <h2>{city.label}</h2>
      <p className="clock-time">{formatTime(now, city.zone, true, timeFormat)}</p>
      <p className="clock-date">
        {formatDate(now, city.zone)} · {city.accent}
      </p>
    </Card>
  )
}

function DirectionToggle({ sourceKey, onChange }) {
  return (
    <div className="direction-toggle" aria-label="Conversion direction">
      {directions.map((direction) => (
        <Button
          aria-pressed={sourceKey === direction.source}
          className="direction-option"
          key={direction.source}
          type="button"
          variant="secondary"
          onClick={() => onChange(direction.source)}
        >
          {cities[direction.source].label}
          <span>to</span>
          {cities[direction.target].label}
        </Button>
      ))}
    </div>
  )
}

function TimeEditor({ source, value, onChange }) {
  const inputParts = getInputParts(value)
  const timeControlParts = getTimeControlParts(value)
  const [activeTimePart, setActiveTimePart] = useState(null)
  const [timeDraft, setTimeDraft] = useState(timeControlParts)

  const handleTimeFocus = (event, part) => {
    setActiveTimePart(part)
    setTimeDraft(timeControlParts)
    event.target.select()
  }

  const handleTimeChange = (part, rawValue) => {
    const digits = rawValue.replace(/\D/g, '').slice(0, 2)
    setTimeDraft((current) => ({
      ...current,
      [part]: digits,
    }))

    if (!digits) return
    onChange(updateTimePart(value, part, digits))
  }

  const handleTimeBlur = () => {
    setActiveTimePart(null)
  }

  return (
    <div className="time-editor" aria-label={`${source.label} date and time`}>
      <Label>
        <span>Date</span>
        <Input
          type="date"
          value={inputParts.date}
          onChange={(event) => onChange(updateInputPart(value, 'date', event.target.value))}
          onInput={(event) => onChange(updateInputPart(value, 'date', event.target.value))}
        />
      </Label>
      <div className="time-field">
        <span>Time</span>
        <div className="custom-time-control">
          <Input
            aria-label={`${source.label} hour`}
            inputMode="numeric"
            maxLength={2}
            pattern="[0-9]*"
            type="text"
            value={activeTimePart === 'hour' ? timeDraft.hour : timeControlParts.hour}
            onBlur={handleTimeBlur}
            onChange={(event) => handleTimeChange('hour', event.target.value)}
            onFocus={(event) => handleTimeFocus(event, 'hour')}
          />
          <span className="time-separator">:</span>
          <Input
            aria-label={`${source.label} minute`}
            inputMode="numeric"
            maxLength={2}
            pattern="[0-9]*"
            type="text"
            value={activeTimePart === 'minute' ? timeDraft.minute : timeControlParts.minute}
            onBlur={handleTimeBlur}
            onChange={(event) => handleTimeChange('minute', event.target.value)}
            onFocus={(event) => handleTimeFocus(event, 'minute')}
          />
        </div>
      </div>
    </div>
  )
}

function MainConverter({
  sourceKey,
  inputValue,
  convertedDate,
  timeFormat,
  onDirectionChange,
  onInputChange,
}) {
  const source = cities[sourceKey]
  const targetKey = sourceKey === CITY_KEYS.DENVER ? CITY_KEYS.ISTANBUL : CITY_KEYS.DENVER
  const target = cities[targetKey]
  const status = convertedDate
    ? getOverlapStatus(convertedDate)
    : { tone: 'late', label: 'Needs time', note: 'Enter a complete date and time.' }
  const shortcuts = [
    { key: 'now', label: 'Now' },
    { key: 'tonight', label: 'Tonight' },
    { key: 'tomorrow', label: 'Tomorrow morning' },
    { key: 'weekend', label: 'Weekend' },
  ]

  return (
    <Card className="converter-panel main-converter-panel">
      <div className="converter-heading">
        <div>
          <p className="panel-kicker">Check a time</p>
          <h2>{source.label} to {target.label}</h2>
        </div>
        <DirectionToggle sourceKey={sourceKey} onChange={onDirectionChange} />
      </div>

      <div className="main-converter-grid">
        <div className="source-editor">
          <div className="city-converter-head">
            <span>{source.country}</span>
            <strong>{source.label}</strong>
          </div>
          <TimeEditor source={source} value={inputValue} onChange={onInputChange} />
          <div className="shortcut-row" aria-label="Quick time shortcuts">
            {shortcuts.map((shortcut) => (
              <Button
                className="shortcut-button"
                key={shortcut.key}
                type="button"
                variant="secondary"
                onClick={() => onInputChange(shortcutInput(shortcut.key, source.zone))}
              >
                {shortcut.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="result-converter">
          <div className="city-converter-head">
            <span>{target.country}</span>
            <strong>{target.label}</strong>
          </div>
          <div className="result-box">
            <span>Converted time</span>
            {convertedDate ? (
              <>
                <strong>{formatTime(convertedDate, target.zone, false, timeFormat)}</strong>
                <small>{formatDate(convertedDate, target.zone)}</small>
              </>
            ) : (
              <>
                <strong>--:--</strong>
                <small>Waiting for a valid time</small>
              </>
            )}
          </div>
          <Badge className={`status-pill ${status.tone}`} variant="secondary">
            <span>{status.label}</span>
            <small>{status.note}</small>
          </Badge>
        </div>
      </div>
    </Card>
  )
}

function BestTimes({ suggestions, sourceKey, timeFormat, onSelect }) {
  const source = cities[sourceKey]
  const targetKey = sourceKey === CITY_KEYS.DENVER ? CITY_KEYS.ISTANBUL : CITY_KEYS.DENVER
  const target = cities[targetKey]

  return (
    <section className="best-times-section" aria-label="Best time suggestions">
      <div className="section-heading compact">
        <p className="section-label">Best today</p>
        <h2>Next good times</h2>
      </div>

      <Card className="best-times-list">
        {suggestions.map((suggestion) => (
          <button
            className="best-time-row"
            key={suggestion.value}
            type="button"
            onClick={() => onSelect(suggestion.value)}
          >
            <span className="best-city-time">
              <small>{source.label}</small>
              <strong>{formatTime(suggestion.instant, source.zone, false, timeFormat)}</strong>
            </span>
            <span className="best-city-time">
              <small>{target.label}</small>
              <strong>{formatTime(suggestion.instant, target.zone, false, timeFormat)}</strong>
            </span>
            <Badge className={`row-status ${suggestion.status.tone}`} variant="secondary">
              {suggestion.status.label}
            </Badge>
          </button>
        ))}
      </Card>
    </section>
  )
}

function App() {
  const initialState = useMemo(() => getInitialState(), [])
  const [now, setNow] = useState(() => new Date())
  const [sourceKey, setSourceKey] = useState(initialState.sourceKey)
  const [converterInput, setConverterInput] = useState(initialState.inputValue)
  const [timeFormat, setTimeFormat] = useState(initialState.timeFormat)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams({
      from: sourceKey,
      at: converterInput,
      format: timeFormat,
    })
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  }, [converterInput, sourceKey, timeFormat])

  const source = cities[sourceKey]
  const convertedDate = useMemo(
    () => localDateTimeToInstant(converterInput, source.zone),
    [converterInput, source.zone],
  )
  const suggestions = useMemo(
    () => getBestSuggestions(converterInput, sourceKey),
    [converterInput, sourceKey],
  )
  const currentStatus = getOverlapStatus(now)

  return (
    <main className="app-shell">
      <section className="hero-section">
        <nav className="nav-bar" aria-label="Primary">
          <div className="brand-block">
            <div className="brand-mark">TT</div>
            <span>Time Together</span>
          </div>
          <div className="nav-actions">
            <div className="format-toggle" aria-label="Time format">
              {Object.values(TIME_FORMATS).map((format) => (
                <Button
                  aria-pressed={timeFormat === format}
                  className="format-option"
                  key={format}
                  size="xs"
                  type="button"
                  variant="secondary"
                  onClick={() => setTimeFormat(format)}
                >
                  {format}
                </Button>
              ))}
            </div>
            <Button asChild className="nav-check-button" variant="outline">
              <a href="#converter">Check a time</a>
            </Button>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <h1>Two cities, one easy answer.</h1>
            <p>
              Pick a time once, switch directions when you need to, and share the
              exact Denver and Istanbul match from the URL.
            </p>
          </div>

          <div className="live-clocks" aria-label="Live city clocks">
            <CityClock city={cities.denver} now={now} timeFormat={timeFormat} />
            <CityClock city={cities.istanbul} now={now} timeFormat={timeFormat} />
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
        <MainConverter
          sourceKey={sourceKey}
          inputValue={converterInput}
          convertedDate={convertedDate}
          timeFormat={timeFormat}
          onDirectionChange={setSourceKey}
          onInputChange={setConverterInput}
        />
      </section>

      <BestTimes
        suggestions={suggestions}
        sourceKey={sourceKey}
        timeFormat={timeFormat}
        onSelect={setConverterInput}
      />
    </main>
  )
}

export default App
