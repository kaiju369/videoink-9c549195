const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const ok = (id: string | null | undefined) => (id && ID_RE.test(id) ? id : null);

  if (host === "youtu.be") return ok(url.pathname.slice(1).split("/")[0]);
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (url.pathname === "/watch") return ok(url.searchParams.get("v"));
    if (url.pathname === "/oembed" || url.pathname === "/attribution_link") {
      const nested = url.searchParams.get("url") ?? url.searchParams.get("u");
      if (nested) {
        try {
          return parseYouTubeId(new URL(nested, "https://www.youtube.com").toString());
        } catch {
          return null;
        }
      }
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "v" || parts[0] === "live") {
      return ok(parts[1]);
    }
  }
  return null;
}

/** Start offset encoded in a YouTube URL (`?t=1h2m3s` / `?start=90`), in seconds. */
export function parseYouTubeStart(input: string): number {
  try {
    const url = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`);
    const raw = url.searchParams.get("t") ?? url.searchParams.get("start");
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) return Number(raw);
    const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (!m) return 0;
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Only http(s) and blob URLs may reach a <video src>. This blocks
 * `javascript:` and `data:` payloads pasted into the URL field.
 */
export function isSafeVideoUrl(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  if (raw.startsWith("blob:")) return true;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

let apiPromise: Promise<void> | null = null;

/** Loads the IFrame API once; rejects (and allows a retry) on failure/timeout. */
export function loadYouTubeApi(timeoutMs = 12000): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as Record<string, unknown>;
  if (w["YT"] && (w["YT"] as { Player?: unknown }).Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve, reject) => {
    const prev = w["onYouTubeIframeAPIReady"] as (() => void) | undefined;
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        apiPromise = null;
        reject(err);
      } else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error("YouTube player failed to load (network blocked or offline)")),
      timeoutMs,
    );
    w["onYouTubeIframeAPIReady"] = () => {
      prev?.();
      finish();
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-yt-api="1"]');
    const script = existing ?? document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.dataset["ytApi"] = "1";
    script.onerror = () => finish(new Error("Could not reach the YouTube player script"));
    if (!existing) document.head.appendChild(script);
  });
  return apiPromise;
}

/** Thumbnail candidates from best to worst; callers should fall back in order. */
export function youtubeThumbnailCandidates(id: string): string[] {
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];
}

export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

