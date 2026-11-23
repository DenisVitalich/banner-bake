import { catalog, type Locale } from "../lib/catalog";
import { offerDates, type Creative } from "../lib/model";
import { t } from "../lib/strings";

export function CreativeArt({ creative, locale, full = false }: { creative: Creative; locale: Locale; full?: boolean }): React.JSX.Element {
  const scene = catalog.backgrounds.find(item => item.id === creative.backgroundId);
  const date = offerDates(creative);
  const source = creative.uploadId ? `/api/upload/${creative.uploadId}` : creative.backgroundId && `/api/art/${creative.backgroundId}`;
  const alt = creative.uploadId ? t(locale, "image") : scene?.alt[locale] ?? t(locale, "image");
  if (!source) return <div className={`art art-empty ${full ? "art-full" : "art-thumb"}`} aria-hidden={!full}>
    {full && <><span aria-hidden="true">▧</span><p>{t(locale, "emptyImage")}</p></>}
  </div>;
  return <div className={full ? "art art-full" : "art art-thumb"}>
    <img src={source} alt={full ? alt : ""} />
    {creative.characterId && <img src={`/api/art/${creative.characterId}`} alt="" className="art-person" />}
    <div className="art-shade" aria-hidden={!full}>
      <div className="art-copy" lang={creative.locale}>
        <strong>{creative.headline || (full ? t(creative.locale, "previewEmpty") : "")}</strong>
        {date && <small>{date}</small>}
        {(creative.cta || full) && <span>{creative.cta || t(creative.locale, "buttonEmpty")}</span>}
      </div>
    </div>
  </div>;
}
