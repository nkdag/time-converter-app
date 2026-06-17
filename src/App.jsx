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

function getTimeControlParts(value, timeFormat) {
  const { time } = getInputParts(value)
  const [rawHour = '0', rawMinute = '0'] = time.split(':')
  const hour24 = Math.min(23, Math.max(0, Number(rawHour) || 0))
  const minute = Math.min(59, Math.max(0, Number(rawMinute) || 0))
  const is12Hour = timeFormat === TIME_FORMATS.TWELVE
  const hour12 = hour24 % 12 || 12

  return {
    hour: String(is12Hour ? hour12 : hour24).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
    period: hour24 >= 12 ? 'PM' : 'AM',
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

function updateTimePart(value, part, nextValue, timeFormat) {
  const { date, time } = getInputParts(value)
  const [rawHour = '0', rawMinute = '0'] = time.split(':')
  const currentHour = Math.min(23, Math.max(0, Number(rawHour) || 0))
  const currentMinute = Math.min(59, Math.max(0, Number(rawMinute) || 0))
  const currentPeriod = currentHour >= 12 ? 'PM' : 'AM'
  const currentHour12 = currentHour % 12 || 12
  const nextDigits = String(nextValue).replace(/\D/g, '')
  let nextHour = currentHour
  let nextMinute = currentMinute

  if (part === 'hour') {
    const limit = timeFormat === TIME_FORMATS.TWELVE ? 12 : 23
    const minimum = timeFormat === TIME_FORMATS.TWELVE ? 1 : 0
    const fallback = timeFormat === TIME_FORMATS.TWELVE ? currentHour12 : currentHour
    const parsed = Number(nextDigits || fallback)
    const clampedHour = Math.min(limit, Math.max(minimum, Number.isNaN(parsed) ? fallback : parsed))

    if (timeFormat === TIME_FORMATS.TWELVE) {
      const hourBase = clampedHour === 12 ? 0 : clampedHour
      nextHour = currentPeriod === 'PM' ? hourBase + 12 : hourBase
    } else {
      nextHour = clampedHour
    }
  }

  if (part === 'minute') {
    const parsed = Number(nextDigits || currentMinute)
    nextMinute = Math.min(59, Math.max(0, Number.isNaN(parsed) ? currentMinute : parsed))
  }

  if (part === 'period') {
    const nextPeriod = nextValue === 'PM' ? 'PM' : 'AM'
    const hourBase = currentHour12 === 12 ? 0 : currentHour12
    nextHour = nextPeriod === 'PM' ? hourBase + 12 : hourBase
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

function ConversionPanel({
  title,
  source,
  target,
  value,
  onChange,
  convertedDate,
  timeFormat,
}) {
  const status = convertedDate
    ? getOverlapStatus(convertedDate)
    : { tone: 'late', label: 'Needs time', note: 'Enter a complete date and time.' }
  const inputParts = getInputParts(value)
  const timeControlParts = getTimeControlParts(value, timeFormat)

  return (
    <Card className="converter-panel">
      <div className="converter-heading">
        <p className="panel-kicker">{title}</p>
      </div>
      <div className="conversion-flow">
        <div className="city-converter source-converter">
          <div className="city-converter-head">
            <span>{source.country}</span>
            <strong>{source.label}</strong>
          </div>
          <div className="date-time-control" aria-label={`${source.label} date and time`}>
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
                  value={timeControlParts.hour}
                  onChange={(event) => onChange(updateTimePart(value, 'hour', event.target.value, timeFormat))}
                />
                <span className="time-separator">:</span>
                <Input
                  aria-label={`${source.label} minute`}
                  inputMode="numeric"
                  maxLength={2}
                  pattern="[0-9]*"
                  type="text"
                  value={timeControlParts.minute}
                  onChange={(event) => onChange(updateTimePart(value, 'minute', event.target.value, timeFormat))}
                />
                {timeFormat === TIME_FORMATS.TWELVE ? (
                  <div className="period-toggle" aria-label={`${source.label} period`}>
                    {['AM', 'PM'].map((period) => (
                      <Button
                        aria-pressed={timeControlParts.period === period}
                        className="period-option"
                        key={period}
                        size="xs"
                        type="button"
                        variant="secondary"
                        onClick={() => onChange(updateTimePart(value, 'period', period, timeFormat))}
                      >
                        {period}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <Button
              className="date-now-button"
              type="button"
              variant="secondary"
              onClick={() => onChange(toInputValue(new Date(), source.zone))}
            >
              Now
            </Button>
          </div>
        </div>
        <div className="city-converter result-converter">
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

function App() {
  const [now, setNow] = useState(() => new Date())
  const [denverInput, setDenverInput] = useState(() => toInputValue(new Date(), DENVER_TZ))
  const [istanbulInput, setIstanbulInput] = useState(() => toInputValue(new Date(), ISTANBUL_TZ))
  const [timeFormat, setTimeFormat] = useState(TIME_FORMATS.TWELVE)

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
  const timelineGroups = useMemo(
    () => Array.from({ length: 5 }, (_, index) => timeline.slice(index * 2, index * 2 + 2)),
    [timeline],
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
            <p className="section-label">Denver · Istanbul</p>
            <h1>Two cities, one shared time.</h1>
            <p>
              Compare Denver and Istanbul with a warmer time-zone view for calls,
              messages, family plans, and everyday check-ins.
            </p>
            <div className="hero-meta" aria-label="Supported time zones">
              <Badge variant="secondary">Comfortable overlap</Badge>
              <Badge variant="secondary">Quiet-hour awareness</Badge>
            </div>
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
        <ConversionPanel
          title="From Colorado"
          source={cities.denver}
          target={cities.istanbul}
          value={denverInput}
          onChange={setDenverInput}
          convertedDate={denverConverted}
          timeFormat={timeFormat}
        />
        <ConversionPanel
          title="From Turkey"
          source={cities.istanbul}
          target={cities.denver}
          value={istanbulInput}
          onChange={setIstanbulInput}
          convertedDate={istanbulConverted}
          timeFormat={timeFormat}
        />
      </section>

      <section className="timeline-section">
        <div className="section-heading">
          <p className="section-label">Coming up</p>
          <h2>Upcoming time windows</h2>
        </div>

        <div className="timeline-list">
          {timelineGroups.map((group) => (
            <Card className="timeline-card" key={group.map((date) => date.toISOString()).join('-')}>
              {group.map((date) => {
                const status = getOverlapStatus(date)

                return (
                  <div className="timeline-match" key={date.toISOString()}>
                    <div>
                      <span>Denver</span>
                      <strong>{formatTime(date, DENVER_TZ, false, timeFormat)}</strong>
                    </div>
                    <div>
                      <span>Istanbul</span>
                      <strong>{formatTime(date, ISTANBUL_TZ, false, timeFormat)}</strong>
                    </div>
                    <Badge className={`row-status ${status.tone}`} variant="secondary">
                      {status.label}
                    </Badge>
                  </div>
                )
              })}
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
