import type { ReactNode } from "react";
import type { Locale } from "../lib/catalog";
import type { Errors, Field } from "../lib/model";
import { t } from "../lib/strings";

export function FieldLabel({ label, id, locale, errors, hint, children }: {
  label: string; id: Field; locale: Locale; errors: Errors; hint?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}): React.JSX.Element {
  const error = errors[id];
  const description = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    {children({ id, "aria-invalid": Boolean(error), "aria-describedby": description || undefined })}
    {hint && <small className="field-hint" id={`${id}-hint`}>{hint}</small>}
    {error && <small className="field-error" id={`${id}-error`}>{t(locale, id === "backgroundId" && error === "required" ? "backgroundRequired" : error)}</small>}
  </div>;
}
