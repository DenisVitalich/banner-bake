import type { Creative, Errors, ExportFormat } from "./model";

export class ApiError extends Error {
  constructor(public code: string, public fields: Errors = {}) {
    super(code);
  }
}

async function request(route: string, data?: object): Promise<Response> {
  const response = await fetch(`/api/${route}`, data === undefined ? { cache: "no-store" } : {
    method: "POST",
    body: data instanceof FormData ? data : JSON.stringify(data),
    headers: data instanceof FormData ? undefined : { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const error: { error?: string; fields?: Errors } = await response.json().catch(() => ({}));
    throw new ApiError(error.error ?? "server", error.fields);
  }
  return response;
}

export async function api<T>(route: string, data?: object): Promise<T> {
  return (await request(route, data)).json();
}

export async function downloadPost(creative: Creative, format: ExportFormat): Promise<void> {
  const response = await request("export", { creative, format });
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `creative.${format}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
