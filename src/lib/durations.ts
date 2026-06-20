import { parseSignageApp } from './apps';
import type { AppSettings } from './settings';
import type { Media } from '../types';

type YouTubePlayer = {
  getDuration: () => number;
  destroy: () => void;
};

type YouTubeApi = {
  Player: new (
    elementId: string,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onError?: () => void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function getFallbackDuration(settings: AppSettings): number {
  return Math.max(1, settings.defaultItemDurationSeconds || 10);
}

export function getVideoDurationSeconds(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let timeoutId: number | null = null;

    function cleanup() {
      if (timeoutId) window.clearTimeout(timeoutId);
      video.removeAttribute('src');
      video.load();
    }

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Video duration lookup timed out.'));
    }, 12_000);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Math.ceil(video.duration);
      cleanup();

      if (Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error('Video duration was not available.'));
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Could not read video duration.'));
    };
    video.src = url;
  });
}

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    let timeoutId: number | null = null;
    const previousReady = (window as unknown as { onYouTubeIframeAPIReady?: () => void })
      .onYouTubeIframeAPIReady;

    function cleanup() {
      if (timeoutId) window.clearTimeout(timeoutId);
    }

    (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = () => {
      previousReady?.();
      cleanup();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('YouTube iframe API did not initialize.'));
      }
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        cleanup();
        reject(new Error('Could not load YouTube iframe API.'));
      };
      document.head.appendChild(script);
    }

    timeoutId = window.setTimeout(() => {
      reject(new Error('YouTube duration lookup timed out.'));
    }, 12_000);
  });

  return youtubeApiPromise;
}

export async function getYouTubeDurationSeconds(videoId: string): Promise<number> {
  const youtube = await loadYouTubeApi();
  const container = document.createElement('div');
  const elementId = `youtube-duration-${crypto.randomUUID()}`;
  let player: YouTubePlayer | null = null;
  let timeoutId: number | null = null;

  container.id = elementId;
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '1px';
  container.style.height = '1px';
  document.body.appendChild(container);

  return new Promise((resolve, reject) => {
    function cleanup() {
      if (timeoutId) window.clearTimeout(timeoutId);
      player?.destroy();
      container.remove();
    }

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('YouTube duration lookup timed out.'));
    }, 12_000);

    player = new youtube.Player(elementId, {
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        mute: 1,
      },
      events: {
        onReady: () => {
          const duration = Math.ceil(player?.getDuration() ?? 0);
          cleanup();

          if (Number.isFinite(duration) && duration > 0) {
            resolve(duration);
          } else {
            reject(new Error('YouTube duration was not available.'));
          }
        },
        onError: () => {
          cleanup();
          reject(new Error('Could not read YouTube duration.'));
        },
      },
    });
  });
}

export async function getDefaultPlaylistDuration(
  media: Media,
  settings: AppSettings,
): Promise<number> {
  const fallback = getFallbackDuration(settings);

  try {
    if (media.media_type === 'video') {
      return await getVideoDurationSeconds(media.file_url);
    }

    if (media.media_type === 'url') {
      const app = parseSignageApp(media.file_url);
      if (app?.kind === 'youtube') {
        return await getYouTubeDurationSeconds(app.videoId);
      }
    }
  } catch {
    return fallback;
  }

  return fallback;
}
