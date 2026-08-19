import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { loadYouTubeApi } from "@/lib/videoink/youtube";

export type PlayerSource =
  | { type: "youtube"; videoId: string; title: string }
  | { type: "file"; url: string; title: string }
  | { type: "url"; url: string; title: string };

export interface PlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  /** nudge by one frame at the given fps (default 30); pauses first */
  stepFrame: (dir: 1 | -1, fps?: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaybackRate: () => number;
  setPlaybackRate: (r: number) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  isPlaying: () => boolean;
  getVideoElement: () => HTMLVideoElement | null;
  getAspectRatio: () => number;
  requestPictureInPicture: () => void;
  /** resolves once the currently displayed frame is painted (best effort) */
  waitForFrame: () => Promise<void>;
  /** available resolution ids, best first ("auto" always included) */
  getQualities: () => string[];
  getQuality: () => string;
  setQuality: (q: string) => void;
  /** intrinsic pixel size of the decoded frame, when the runtime exposes it */
  getVideoSize: () => { width: number; height: number } | null;
}

/** YouTube quality ids mapped to human labels; also used for HTML5 heights. */
export const QUALITY_LABELS: Record<string, string> = {
  auto: "Auto",
  tiny: "144p",
  small: "240p",
  medium: "360p",
  large: "480p",
  hd720: "720p",
  hd1080: "1080p",
  hd1440: "1440p",
  hd2160: "2160p",
  highres: "Max",
};

export function qualityLabel(q: string): string {
  return QUALITY_LABELS[q] ?? q;
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (t: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getPlaybackRate: () => number;
  setPlaybackRate: (r: number) => void;
  setVolume: (v: number) => void;
  mute: () => void;
  unMute: () => void;
  getVideoData?: () => { title?: string };
  getAvailableQualityLevels?: () => string[];
  getPlaybackQuality?: () => string;
  setPlaybackQuality?: (q: string) => void;
  setPlaybackQualityRange?: (min: string, max: string) => void;
  destroy: () => void;
}


interface Props {
  source: PlayerSource | null;
  /** exact pixel rect of the visible video content, so the iframe matches the ink layer */
  fit?: { left: number; top: number; width: number; height: number } | undefined;
  onReady?: (info: { duration: number; title: string; aspect: number }) => void;
  onPlayStateChange?: (playing: boolean) => void;
  /** surfaced so the app can show a real message instead of a blank stage */
  onError?: (message: string) => void;
}


export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { source, fit, onReady, onPlayStateChange, onError },
  ref,
) {
  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;
  const stateCb = useRef(onPlayStateChange);
  stateCb.current = onPlayStateChange;
  const errorCb = useRef(onError);
  errorCb.current = onError;

  useEffect(() => {
    if (!source || source.type !== "youtube") {
      ytRef.current?.destroy();
      ytRef.current = null;
      return;
    }
    let cancelled = false;
    setAspect(16 / 9);
    loadYouTubeApi()
      .then(() => {
        if (cancelled || !ytHostRef.current) return;
        const YT = (window as unknown as Record<string, any>)["YT"];
        if (!YT?.Player) throw new Error("YouTube player unavailable");
        ytRef.current?.destroy();
        ytHostRef.current.innerHTML = "";
        const mount = document.createElement("div");
        mount.className = "h-full w-full";
        ytHostRef.current.appendChild(mount);
        ytRef.current = new YT.Player(mount, {
          videoId: source.videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (cancelled) return;
              const data = e.target.getVideoData?.();
              readyCb.current?.({
                duration: e.target.getDuration(),
                title: data?.title || source.title,
                aspect: 16 / 9,
              });
            },
            onStateChange: (e: { data: number }) => {
              stateCb.current?.(e.data === 1);
            },
            onError: (e: { data: number }) => {
              const map: Record<number, string> = {
                2: "That YouTube video ID is invalid",
                5: "This video can't be played in an embedded player",
                100: "That YouTube video was removed or is private",
                101: "The owner doesn't allow this video to be embedded",
                150: "The owner doesn't allow this video to be embedded",
              };
              errorCb.current?.(map[e.data] ?? "The YouTube video could not be played");
            },
          },
        });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          errorCb.current?.(err instanceof Error ? err.message : "YouTube player failed to load");
      });

    return () => {
      cancelled = true;
      try {
        ytRef.current?.destroy();
      } catch {
        /* player may already be gone */
      }
      ytRef.current = null;
    };
  }, [source]);


  useImperativeHandle(
    ref,
    (): PlayerHandle => ({
      play: () => {
        if (ytRef.current) ytRef.current.playVideo();
        else void videoRef.current?.play();
      },
      pause: () => {
        if (ytRef.current) ytRef.current.pauseVideo();
        else videoRef.current?.pause();
      },
      seek: (t) => {
        const safe = Number.isFinite(t) ? Math.max(0, t) : 0;
        if (ytRef.current) ytRef.current.seekTo(safe, true);
        else if (videoRef.current) videoRef.current.currentTime = safe;
      },
      stepFrame: (dir, fps = 30) => {
        const step = 1 / Math.max(1, fps);
        if (ytRef.current) {
          ytRef.current.pauseVideo();
          ytRef.current.seekTo(Math.max(0, ytRef.current.getCurrentTime() + dir * step), true);
        } else if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + dir * step);
        }
      },
      waitForFrame: () =>
        new Promise<void>((resolve) => {
          const v = videoRef.current;
          type WithRVFC = HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: () => void) => number;
          };
          const rvfc = (v as WithRVFC | null)?.requestVideoFrameCallback;
          if (v && typeof rvfc === "function") {
            let settled = false;
            const done = () => {
              if (!settled) {
                settled = true;
                resolve();
              }
            };
            rvfc.call(v, done);
            // Paused videos never fire rVFC — always resolve on the next frames.
            requestAnimationFrame(() => requestAnimationFrame(done));
          } else {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }
        }),

      getCurrentTime: () =>
        ytRef.current?.getCurrentTime() ?? videoRef.current?.currentTime ?? 0,
      getDuration: () =>
        ytRef.current?.getDuration() ?? videoRef.current?.duration ?? 0,
      getPlaybackRate: () =>
        ytRef.current?.getPlaybackRate() ?? videoRef.current?.playbackRate ?? 1,
      setPlaybackRate: (r) => {
        if (ytRef.current) ytRef.current.setPlaybackRate(r);
        else if (videoRef.current) videoRef.current.playbackRate = r;
      },
      setVolume: (v) => {
        if (ytRef.current) ytRef.current.setVolume(Math.round(v * 100));
        else if (videoRef.current) videoRef.current.volume = v;
      },
      setMuted: (m) => {
        if (ytRef.current) m ? ytRef.current.mute() : ytRef.current.unMute();
        else if (videoRef.current) videoRef.current.muted = m;
      },
      isPlaying: () =>
        ytRef.current
          ? ytRef.current.getPlayerState() === 1
          : !!videoRef.current && !videoRef.current.paused,
      getVideoElement: () => (ytRef.current ? null : videoRef.current),
      getAspectRatio: () => aspect,
      requestPictureInPicture: () => {
        void videoRef.current?.requestPictureInPicture?.();
      },
      getQualities: () => {
        const yt = ytRef.current;
        if (yt) {
          const levels = yt.getAvailableQualityLevels?.() ?? [];
          const usable = levels.filter((q) => q && q !== "auto");
          return usable.length ? ["auto", ...usable] : [];
        }
        const v = videoRef.current;
        // A plain <video> has a single encoded resolution — expose it read-only.
        return v?.videoHeight ? ["auto"] : [];
      },
      getQuality: () => {
        const yt = ytRef.current;
        if (yt) return qualityRef.current || yt.getPlaybackQuality?.() || "auto";
        return "auto";
      },
      setQuality: (q) => {
        const yt = ytRef.current;
        if (!yt) return;
        qualityRef.current = q;
        // Both calls matter: the range pins a ceiling, the setter nudges now.
        if (q === "auto") yt.setPlaybackQualityRange?.("tiny", "highres");
        else yt.setPlaybackQualityRange?.(q, q);
        yt.setPlaybackQuality?.(q === "auto" ? "default" : q);
      },
      getVideoSize: () => {
        const v = videoRef.current;
        if (v?.videoWidth && v.videoHeight)
          return { width: v.videoWidth, height: v.videoHeight };
        return null;
      },

    }),
    [aspect],
  );

  if (!source) return null;

  if (source.type === "youtube") {
    const box =
      fit && fit.width > 0 && fit.height > 0
        ? { left: fit.left, top: fit.top, width: fit.width, height: fit.height }
        : null;
    return (
      <div className="absolute inset-0">
        <div
          className="pointer-events-none absolute"
          style={
            box
              ? { left: box.left, top: box.top, width: box.width, height: box.height }
              : { inset: 0 }
          }
        >
          <div ref={ytHostRef} className="h-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={source.url}
      playsInline
      preload="metadata"
      // anonymous CORS keeps remote frames drawable on a canvas when the host allows it
      {...(source.type === "url" ? { crossOrigin: "anonymous" as const } : {})}
      className="absolute inset-0 h-full w-full object-contain"
      onError={() =>
        errorCb.current?.(
          source.type === "url"
            ? "That video URL could not be loaded (wrong link, or the host blocks playback)"
            : "That video file could not be played",
        )
      }

      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        const ar = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
        setAspect(ar);
        readyCb.current?.({ duration: v.duration, title: source.title, aspect: ar });
      }}
      onPlay={() => stateCb.current?.(true)}
      onPause={() => stateCb.current?.(false)}
    />
  );
});
