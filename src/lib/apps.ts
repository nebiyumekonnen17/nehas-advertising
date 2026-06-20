export type SignageApp =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'weather'; name: string; latitude: number; longitude: number }
  | { kind: 'clock'; label: string }
  | { kind: 'website'; url: string };

export type WeatherLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

export function extractYouTubeVideoId(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '') || null;
    }

    if (parsed.searchParams.get('v')) {
      return parsed.searchParams.get('v');
    }

    const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) return embedMatch[1];
  } catch {
    if (/^[a-zA-Z0-9_-]{8,}$/.test(value.trim())) {
      return value.trim();
    }
  }

  return null;
}

export function createYouTubeAppUrl(videoId: string): string {
  return `app://youtube?videoId=${encodeURIComponent(videoId)}`;
}

export function createWeatherAppUrl(location: WeatherLocation): string {
  const params = new URLSearchParams({
    name: location.name,
    lat: String(location.latitude),
    lon: String(location.longitude),
  });
  return `app://weather?${params.toString()}`;
}

export function createClockAppUrl(label: string): string {
  return `app://clock?label=${encodeURIComponent(label || 'Clock')}`;
}

export function createWebsiteAppUrl(url: string): string {
  return `app://website?url=${encodeURIComponent(url)}`;
}

export function parseSignageApp(value: string): SignageApp | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'app:') return null;

    if (parsed.hostname === 'youtube') {
      const videoId = parsed.searchParams.get('videoId');
      return videoId ? { kind: 'youtube', videoId } : null;
    }

    if (parsed.hostname === 'weather') {
      const name = parsed.searchParams.get('name') || 'Weather';
      const latitude = Number(parsed.searchParams.get('lat'));
      const longitude = Number(parsed.searchParams.get('lon'));
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { kind: 'weather', name, latitude, longitude };
      }
      return null;
    }

    if (parsed.hostname === 'clock') {
      return { kind: 'clock', label: parsed.searchParams.get('label') || 'Clock' };
    }

    if (parsed.hostname === 'website') {
      const url = parsed.searchParams.get('url');
      return url ? { kind: 'website', url } : null;
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolveWeatherLocation(query: string): Promise<WeatherLocation> {
  const endpoint = new URL('https://geocoding-api.open-meteo.com/v1/search');
  endpoint.searchParams.set('name', query);
  endpoint.searchParams.set('count', '1');
  endpoint.searchParams.set('language', 'en');
  endpoint.searchParams.set('format', 'json');

  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    throw new Error(`Weather location lookup failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }>;
  };

  const first = payload.results?.[0];
  if (!first) {
    throw new Error('No weather location was found. Try a city name like Addis Ababa or Los Angeles.');
  }

  return {
    name: [first.name, first.admin1, first.country].filter(Boolean).join(', '),
    latitude: first.latitude,
    longitude: first.longitude,
  };
}

export function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  return parsed.toString();
}
