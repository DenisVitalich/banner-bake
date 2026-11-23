import { useEffect, useRef, useState } from "react";
import type { Locale } from "../lib/catalog";
import { availableChoices, choiceTitle, type Choices } from "../lib/choices";
import { copyOptions, type Creative, type Errors, type Upload, type Version } from "../lib/model";
import { t } from "../lib/strings";
import { CreativeArt } from "./art";
import { FieldLabel } from "./fields";

const modes = ["both", "textOnly", "imageOnly"] as const;
type Mode = (typeof modes)[number];
type Generation = { key: string; status: "working" | "ready" };

export function Compose({ value, patch, locale, errors, disabled, uploads, upload, versions, choices }: {
  value: Creative; patch: (change: Partial<Creative>) => void; locale: Locale; errors: Errors;
  disabled: boolean; uploads: Upload[]; upload: (file: File) => Promise<void>; versions: Version[]; choices: Choices;
}): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("both");
  const [generation, setGeneration] = useState<Generation>();
  const [reuse, setReuse] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const scenes = availableChoices(choices, "background", value.backgroundId)
    .filter(scene => scene.gameId === value.gameId && scene.themeId === value.themeId);
  const people = availableChoices(choices, "character", value.characterId).filter(person => person.gameId === value.gameId);
  const backgroundId = value.backgroundId || scenes[0]?.id || "";
  const catalogCopy = copyOptions({ ...value, backgroundId });
  const game = choiceTitle(choices, value.gameId, value.locale);
  const options = catalogCopy.length ? catalogCopy.map(option => ({
    id: option.id, characterId: option.characterId,
    headline: option.headline[value.locale], post: option.post[value.locale], cta: option.cta[value.locale],
  })) : game ? (["discover", "return"] as const).map(style => ({
    id: style, characterId: null,
    headline: t(value.locale, `sampleTitle-${style}`, { game }),
    post: t(value.locale, `samplePost-${style}`, { game }),
    cta: t(value.locale, "samplePlay"),
  })) : [];
  const textSource = versions.find(item => item.id === reuse)?.creative;
  const imageOptions: Pick<Creative, "backgroundId" | "uploadId" | "characterId">[] = scenes.flatMap(scene => [null, ...people.map(item => item.id)].map(characterId => ({
    backgroundId: scene.id, uploadId: null, characterId,
  })));
  if (!imageOptions.length && value.uploadId) imageOptions.push({
    backgroundId: "", uploadId: value.uploadId, characterId: value.characterId,
  });
  const generationKey = [mode, value.gameId, value.themeId, value.backgroundId, value.uploadId, value.locale].join("/");
  const generating = generation?.key === generationKey && generation.status === "working";
  const show = generation?.key === generationKey && generation.status === "ready";
  const missingArt = mode === "imageOnly" ? !imageOptions.length : mode === "both" && !backgroundId && !value.uploadId;
  const noVariants = missingArt || (mode !== "imageOnly" && !options.length);
  const noResults = missingArt ? "noCatalogArt" : "noVariants";

  useEffect(() => {
    if (generation?.status !== "working") return;
    const timer = window.setTimeout(() => setGeneration(current => current === generation
      ? { ...generation, status: "ready" } : current), 1000);
    return () => window.clearTimeout(timer);
  }, [generation]);

  function apply(change: Partial<Creative>): void {
    patch(change);
    setGeneration(undefined);
  }

  return <section className="panel compose">
    <div className="panel-title"><h2>{t(locale, "creative")}</h2><p>{t(locale, "designIntro")}</p></div>
    <fieldset className="fields" disabled={disabled}>
      <div className="compose-toolbar">
        <label className="field"><span>{t(locale, "mode")}</span>
          <select value={mode} onChange={event => {
            setMode(modes.find(item => item === event.target.value) ?? "both");
            setGeneration(undefined);
          }}>{modes.map(item => <option key={item} value={item}>{t(locale, item)}</option>)}</select>
        </label>
        <button type="button" className="button soft generate-button" aria-disabled={generating} onClick={() => {
          if (!generating) setGeneration({ key: generationKey, status: "working" });
        }}>
          <span className={generating ? "generation-spinner" : undefined} aria-hidden="true">{!generating && "✦"}</span>
          {t(locale, generating ? "generating" : "generate")}
        </button>
      </div>
      <span className="screen-reader" role="status">{generating ? t(locale, "generating") : show ? t(locale, noVariants ? noResults : "variantsReady") : ""}</span>
      {generating && <div className="variant-grid" aria-hidden="true">
        {[0, 1].map(index => <div className="generation-placeholder" key={index}>
          {mode !== "textOnly" && <div className="generation-image" />}
          <div className="generation-line" /><div className="generation-line generation-line-short" />
        </div>)}
      </div>}
      {show && <div className="variant-grid">
        {noVariants ? <p>{t(locale, noResults)}</p> : mode === "imageOnly" ? imageOptions.map(change => {
          const scene = choiceTitle(choices, change.backgroundId, locale) || t(locale, "customImage");
          const character = change.characterId ? choiceTitle(choices, change.characterId, locale) : t(locale, "noCharacter");
          return <button key={`${change.backgroundId}/${change.characterId}`} type="button" className="variant" onClick={() => apply(change)}>
            <CreativeArt creative={{ ...value, ...change, headline: "", cta: "" }} locale={locale} /><span>{scene} · {character}</span>
          </button>;
        }) : options.map(option => {
          const { headline, post, cta } = option;
          const copy = { headline, post, cta };
          const characterId = value.characterId ?? people.find(person => person.id === option.characterId)?.id ?? null;
          const change = mode === "textOnly" ? copy : {
            ...copy, backgroundId, uploadId: backgroundId ? null : value.uploadId, characterId,
          };
          return <button key={option.id} type="button" className="variant" onClick={() => apply(change)}>
            {mode === "both" && <CreativeArt creative={{ ...value, ...change }} locale={locale} />}
            <span lang={value.locale}><strong>{headline}</strong><small>{post}</small></span>
          </button>;
        })}
      </div>}
      <div className="field-grid">
        <FieldLabel id="uploadId" label={t(locale, "chooseImage")} locale={locale} errors={errors}>{props =>
          <select {...props} value={value.uploadId ?? ""} onChange={event => patch({ uploadId: event.target.value || null })}>
            <option value="">{t(locale, value.backgroundId ? "catalogImage" : "noImageSelected")}</option>
            {uploads.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        }</FieldLabel>
        <div className="field"><span>{t(locale, "customImage")}</span>
          <button type="button" className="button secondary upload-button" aria-label={t(locale, "upload")} aria-describedby="upload-hint"
            onClick={() => fileInput.current?.click()}>{t(locale, "browseImage")}</button>
          <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }} />
          <small id="upload-hint">{t(locale, "uploadHint")}</small>
        </div>
      </div>
      <div className="compose-toolbar">
        <label className="field"><span>{t(locale, "reuse")}</span>
          <select value={reuse} onChange={event => setReuse(event.target.value)}>
            <option value="">{t(locale, "choose")}</option>
            {versions.filter(item => item.creative.headline).map(item => <option key={item.id} value={item.id}>{item.creative.headline}</option>)}
          </select>
        </label>
        <button type="button" className="button secondary" disabled={!textSource} onClick={() => {
          if (textSource) patch({ headline: textSource.headline, post: textSource.post, cta: textSource.cta });
        }}>{t(locale, "reuseText")}</button>
      </div>
      <button className="text-button scratch" type="button" onClick={() => patch({ headline: "", post: "", cta: "" })}>{t(locale, "fromScratch")}</button>
      <FieldLabel id="headline" label={t(locale, "headline")} locale={locale} errors={errors}>{props =>
        <textarea {...props} rows={2} maxLength={100} lang={value.locale} value={value.headline} onChange={event => patch({ headline: event.target.value })} />
      }</FieldLabel>
      <FieldLabel id="post" label={t(locale, "postMain")} hint={t(locale, "postHelp")} locale={locale} errors={errors}>{props =>
        <textarea {...props} rows={4} maxLength={3000} lang={value.locale} value={value.post} onChange={event => patch({ post: event.target.value })} />
      }</FieldLabel>
      <FieldLabel id="cta" label={t(locale, "cta")} locale={locale} errors={errors}>{props =>
        <input {...props} type="text" maxLength={30} lang={value.locale} value={value.cta} onChange={event => patch({ cta: event.target.value })} />
      }</FieldLabel>
    </fieldset>
  </section>;
}
