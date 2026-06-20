export function formatRelativeLastSeen(value: string | null): string {
  if (!value) return 'Never seen';
  const lastSeen = new Date(value).getTime();
  if (Number.isNaN(lastSeen)) return 'Unknown';

  const seconds = Math.max(0, Math.floor((Date.now() - lastSeen) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function isOnline(value: string | null): boolean {
  if (!value) return false;
  const lastSeen = new Date(value).getTime();
  if (Number.isNaN(lastSeen)) return false;
  return Date.now() - lastSeen < 180_000;
}

export function parseTimeToMinutes(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

export function isWithinWindow(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  date = new Date(),
): boolean {
  const now = date.getHours() * 60 + date.getMinutes();
  const start = parseTimeToMinutes(startTime, 0);
  const end = parseTimeToMinutes(endTime, 23 * 60 + 59);

  if (start <= end) {
    return now >= start && now <= end;
  }

  return now >= start || now <= end;
}
