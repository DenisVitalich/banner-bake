import { localeSchema, type Locale } from "../lib/catalog";
import { availableChoices, type Choices } from "../lib/choices";
import { dateLabel, platformSchema, type Creative, type Errors } from "../lib/model";
import { t } from "../lib/strings";
import { FieldLabel } from "./fields";

type Props = { value: Creative; set: (patch: Partial<Creative>) => void; locale: Locale; errors: Errors; disabled: boolean; choices: Choices };

export function Brief({ value, set, locale, errors, disabled, choices }: Props): React.JSX.Element {
  const scenes = availableChoices(choices, "background", value.backgroundId).filter(scene => scene.gameId === value.gameId && scene.themeId === value.themeId);
  const people = availableChoices(choices, "character", value.characterId).filter(person => person.gameId === value.gameId);
  const fieldProps = { locale, errors };
  const publications = availableChoices(choices, "publication", value.publicationId);
  const selectedPublication = value.publicationId ?? publications.find(item => item.id === value.type)?.id ?? "";
  function group(gameId: string, themeId: string): void {
    set({ gameId, themeId, backgroundId: "", characterId: gameId === value.gameId ? value.characterId : null });
  }
  function datePair(start: "flightStart" | "offerStart", end: "flightEnd" | "offerEnd", label: string): React.JSX.Element {
    return <div className="date-group" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="field-grid">
        <FieldLabel id={start} label={t(locale, "from")} {...fieldProps}>{props =>
          <div className="date-input">
            <input {...props} type="date" value={value[start]} onChange={event => set({ [start]: event.target.value })} />
            <span aria-hidden="true">{dateLabel(value[start], locale) || "—"}</span>
          </div>
        }</FieldLabel>
        <FieldLabel id={end} label={t(locale, "until")} {...fieldProps}>{props =>
          <div className="date-input">
            <input {...props} type="date" value={value[end]} onChange={event => set({ [end]: event.target.value })} />
            <span aria-hidden="true">{dateLabel(value[end], locale) || "—"}</span>
          </div>
        }</FieldLabel>
      </div>
    </div>;
  }
  return <section className="panel brief">
    <div className="panel-title"><h2>{t(locale, "brief")}</h2><p>{t(locale, "briefIntro")}</p></div>
    <fieldset disabled={disabled} className="fields">
      <div className="field-grid">
        <FieldLabel id="gameId" label={t(locale, "game")} {...fieldProps}>{props =>
          <select {...props} value={value.gameId} onChange={event => group(event.target.value, value.themeId)}>
            <option value="">{t(locale, "choose")}</option>
            {availableChoices(choices, "game", value.gameId).map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}
          </select>
        }</FieldLabel>
        <FieldLabel id="themeId" label={t(locale, "theme")} {...fieldProps}>{props =>
          <select {...props} value={value.themeId} onChange={event => group(value.gameId, event.target.value)}>
            <option value="">{t(locale, "choose")}</option>
            {availableChoices(choices, "theme", value.themeId).map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}
          </select>
        }</FieldLabel>
        <FieldLabel id="backgroundId" label={t(locale, "scene")} {...fieldProps}>{props =>
          <select {...props} value={value.backgroundId} onChange={event => set({ backgroundId: event.target.value, uploadId: event.target.value ? null : value.uploadId })}>
            <option value="">{t(locale, "noScene")}</option>
            {scenes.map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}
          </select>
        }</FieldLabel>
        <FieldLabel id="characterId" label={t(locale, "character")} {...fieldProps}>{props =>
          <select {...props} value={value.characterId ?? ""} onChange={event => set({ characterId: event.target.value || null })}>
            <option value="">{t(locale, "noCharacter")}</option>
            {people.map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}
          </select>
        }</FieldLabel>
        <FieldLabel id="type" label={t(locale, "type")} {...fieldProps}>{props =>
          <select {...props} value={selectedPublication} onChange={event => {
            const item = publications.find(item => item.id === event.target.value);
            if (item) set({ type: item.behavior, publicationId: item.id });
          }}>
            <option value="" disabled>{t(locale, "choose")}</option>
            {publications.map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}
          </select>
        }</FieldLabel>
        <FieldLabel id="locale" label={t(locale, "creativeLanguage")} {...fieldProps}>{props =>
          <select {...props} value={value.locale} onChange={event => set({ locale: localeSchema.parse(event.target.value) })}>
            <option value="ru">Русский</option><option value="en">English</option>
          </select>
        }</FieldLabel>
      </div>
      <fieldset className="platform-group" id="platforms" tabIndex={-1} aria-invalid={Boolean(errors.platforms)}
        aria-describedby={errors.platforms ? "platforms-error" : undefined}>
        <legend>{t(locale, "platforms")}</legend>
        <div className="platform-options">{platformSchema.options.map(platform => <label key={platform}>
          <input type="checkbox" checked={value.platforms.includes(platform)} onChange={event => set({
            platforms: event.target.checked ? [...value.platforms, platform] : value.platforms.filter(item => item !== platform),
          })} />
          {t(locale, `platform-${platform}`)}
        </label>)}</div>
        {errors.platforms && <small className="field-error" id="platforms-error">{t(locale, "platformRequired")}</small>}
      </fieldset>
      {datePair("flightStart", "flightEnd", t(locale, "flight"))}
      {value.type !== "giveaway" && <FieldLabel id="offer" label={t(locale, "offer")} hint={t(locale, value.type === "announcement" ? "optionalOfferHint" : "offerHint")} {...fieldProps}>{props =>
        <textarea {...props} rows={2} maxLength={500} value={value.offer} onChange={event => set({ offer: event.target.value })} />
      }</FieldLabel>}
      {value.type === "giveaway" && <>
        <FieldLabel id="prize" label={t(locale, "prize")} {...fieldProps}>{props =>
          <input {...props} maxLength={500} value={value.prize} onChange={event => set({ prize: event.target.value })} />
        }</FieldLabel>
        <FieldLabel id="entryRules" label={t(locale, "entryRules")} {...fieldProps}>{props =>
          <textarea {...props} rows={2} maxLength={1000} value={value.entryRules} onChange={event => set({ entryRules: event.target.value })} />
        }</FieldLabel>
      </>}
      {datePair("offerStart", "offerEnd", t(locale, value.type === "giveaway" ? "giveawayPeriod" : "period"))}
    </fieldset>
  </section>;
}
