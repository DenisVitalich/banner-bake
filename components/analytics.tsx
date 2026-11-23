import { useState } from "react";
import { dateSchema, type Locale } from "../lib/catalog";
import { availableChoices, type Choices } from "../lib/choices";
import { analyticsDemo, analyticsMetrics, chartDate, metricValue, shiftDate, spanDays, totalsFor, type Metric } from "../lib/analytics-demo";
import { dateLabel } from "../lib/model";
import { number, percent, t } from "../lib/strings";

export function Analytics({ locale, choices, today }: { locale: Locale; choices: Choices; today: string }): React.JSX.Element {
  const [start, setStart] = useState(() => shiftDate(today, -29));
  const [end, setEnd] = useState(today);
  const [game, setGame] = useState("");
  const [metric, setMetric] = useState<Metric>("installs");
  const [day, setDay] = useState("");
  const games = availableChoices(choices, "game");
  const selected = games.filter(item => !game || game === item.id);
  const ids = selected.map(item => item.id);
  const data = analyticsDemo(today);
  const valid = dateSchema.safeParse(start).success && dateSchema.safeParse(end).success && start <= end;
  const current = valid ? data.filter(row => row.date >= start && row.date <= end) : [];
  const selectedDays = valid ? spanDays(start, end) : 0;
  const previous = selectedDays > 0 && current.length === selectedDays
    ? data.filter(row => row.date >= shiftDate(start, -selectedDays) && row.date < start)
    : [];
  const totals = totalsFor(current, ids);
  const baseline = totalsFor(previous, ids);
  const comparable = previous.length > 0 && previous.length === selectedDays;
  const points = current.map(row => ({ date: row.date, value: metricValue(totalsFor([row], ids), metric) }));
  const max = Math.max(1e-9, ...points.map(point => point.value));
  const selectedIndex = points.findIndex(point => point.date === day);
  const activeIndex = selectedIndex < 0 ? points.length - 1 : selectedIndex;
  const active = points[activeIndex];
  const byGame = selected.map(item => ({ item, value: metricValue(totalsFor(current, [item.id]), metric) }));
  const maxByGame = Math.max(1e-9, ...byGame.map(item => item.value));
  const metricTitle = (item: Metric): string => item === "ctr" ? "CTR" : t(locale, item);
  const format = (value: number, item = metric): string => item === "ctr" ? percent(locale, value) : number(locale, Math.round(value));

  function period(days: number): void {
    setStart(shiftDate(today, 1 - days));
    setEnd(today);
  }

  return <main className="shell analytics-page">
    <div className="page-heading">
      <div><h1>{t(locale, "analytics")}</h1><p>{t(locale, "analyticsIntro")}</p></div>
      <span className="demo-tag">{t(locale, "demo")}</span>
    </div>
    <section className="panel analytics-filters" aria-label={t(locale, "analyticsFilters")}>
      <label className="field"><span>{t(locale, "game")}</span><select value={game} onChange={event => setGame(event.target.value)}>
        <option value="">{t(locale, "allGames")}</option>
        {games.map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}
      </select></label>
      <label className="field"><span>{t(locale, "from")}</span><input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label className="field"><span>{t(locale, "until")}</span><input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
      <div className="analytics-periods" role="group" aria-label={t(locale, "quickPeriods")}>
        {[7, 30, 60].map(days => <button type="button" className="button secondary" key={days}
          aria-pressed={end === today && start === shiftDate(today, 1 - days)} onClick={() => period(days)}>
          {t(locale, "periodDays", { days: number(locale, days) })}</button>)}
      </div>
    </section>
    {!valid ? <p className="analytics-empty">{t(locale, "invalidPeriod")}</p> : !totals.impressions ? <p className="analytics-empty">{t(locale, "noAnalyticsData")}</p> : <>
      <div className="analytics-totals">
        {analyticsMetrics.map(item => {
          const now = metricValue(totals, item);
          const before = metricValue(baseline, item);
          const delta = before && comparable ? (now - before) / before : null;
          return <button type="button" className="panel analytics-total" key={item} aria-pressed={metric === item} onClick={() => setMetric(item)}>
            <span>{metricTitle(item)}</span><strong>{format(now, item)}</strong>
            {delta !== null && <small className={delta >= 0 ? "trend-up" : "trend-down"}>
              {delta > 0 ? "+" : ""}{percent(locale, delta)} {t(locale, "vsPrevious")}
            </small>}
          </button>;
        })}
      </div>
      <div className="analytics-charts">
        <section className="panel analytics-chart">
          <div className="chart-heading"><div><h2>{t(locale, "trend")}</h2>
            <p>{metricTitle(metric)} · {dateLabel(current[0].date, locale)} – {dateLabel(current.at(-1)?.date ?? "", locale)}</p></div>
            {active && <div className="chart-focus" aria-live="off"><strong>{format(active.value)}</strong><small>{chartDate(active.date, locale)}</small></div>}
          </div>
          <div className="chart-plot">
            <div className="chart-axis" aria-hidden="true"><span>{format(max)}</span><span>{format(max / 2)}</span><span>{format(0)}</span></div>
            <div className="chart-bars" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
              {points.map(point => <div className={point === active ? "bar-slot bar-current" : "bar-slot"} key={point.date}
                title={`${chartDate(point.date, locale)} · ${format(point.value)}`} onPointerEnter={() => setDay(point.date)}>
                <span style={{ height: `${point.value / max * 100}%` }} />
              </div>)}
            </div>
          </div>
          <div className="chart-dates" aria-hidden="true"><span>{chartDate(points[0].date, locale)}</span>
            <span>{chartDate(points.at(-1)?.date ?? "", locale)}</span></div>
          {points.length > 1 && <label className="chart-range">{t(locale, "chartDay")}
            <input type="range" min={0} max={points.length - 1} value={activeIndex}
              aria-valuetext={active ? `${chartDate(active.date, locale)} · ${format(active.value)}` : undefined}
              onChange={event => setDay(points[Number(event.target.value)].date)} />
          </label>}
        </section>
        <section className="panel analytics-chart analytics-breakdown">
          <div className="chart-heading"><div><h2>{t(locale, "byGame")}</h2><p>{metricTitle(metric)}</p></div></div>
          <ol>{byGame.map(({ item, value }) => <li key={item.id}>
            <div><span>{item.title[locale]}</span><strong>{format(value)}</strong></div>
            <span className="breakdown-bar" aria-hidden="true"><span style={{ width: `${value / maxByGame * 100}%` }} /></span>
          </li>)}</ol>
        </section>
      </div>
    </>}
  </main>;
}
