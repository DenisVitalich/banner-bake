import { useState } from "react";
import type { Locale } from "../lib/catalog";
import { publication, type Creative, type Platform } from "../lib/model";
import { t } from "../lib/strings";
import { CreativeArt } from "./art";

export function PlacementPreview({ creative, locale, game }: { creative: Creative; locale: Locale; game: string }): React.JSX.Element {
  const [selection, setSelection] = useState<Platform>();
  const platform = selection && creative.platforms.includes(selection) ? selection : creative.platforms[0];

  if (!platform) return <CreativeArt creative={creative} locale={locale} full />;
  const post = creative.post.trim() ? publication(creative) : t(locale, "postEmpty");
  const publisher = game || "Banner Bake";

  return <div className="placement-preview">
    <div className="placement-tabs" role="group" aria-label={t(locale, "platformPreview")}>
      {creative.platforms.map(item => <button key={item} type="button" aria-pressed={item === platform}
        onClick={() => setSelection(item)}>{t(locale, `platform-${item}`)}</button>)}
    </div>
    <article className={`placement-card placement-${platform}`} aria-label={t(locale, `platform-${platform}`)}>
      <div className="placement-masthead">
        <span className="placement-avatar" aria-hidden="true">{publisher[0]}</span>
        <div><strong>{publisher}</strong><small>{t(locale, `placementContext-${platform}`)}</small></div>
      </div>
      <div className="placement-content">
        <CreativeArt creative={creative} locale={locale} full />
        <div className="placement-caption">
          <p lang={creative.post.trim() ? creative.locale : locale}>{post}</p>
        </div>
      </div>
    </article>
  </div>;
}
