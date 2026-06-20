import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Loader2, MonitorPlay } from 'lucide-react';
import { useAppSettings } from '../hooks/useAppSettings';
import { supabase } from '../lib/supabase';
import type { Screen } from '../types';

type Props = {
  onNavigate: (path: string) => void;
};

const STORED_SCREEN_KEY = 'digital-signage-screen-id';

export default function PlayerPairing({ onNavigate }: Props) {
  const { settings } = useAppSettings();
  const [code, setCode] = useState('');
  const [savedScreenId, setSavedScreenId] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSavedScreenId(window.localStorage.getItem(STORED_SCREEN_KEY));
  }, []);

  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    setIsPairing(true);
    try {
      const { data, error: lookupError } = await supabase
        .from('screens')
        .select('*')
        .eq('pairing_code', code.trim())
        .maybeSingle();

      if (lookupError) throw lookupError;
      const screen = data as Screen | null;
      if (!screen) {
        setError('No screen was found for that pairing code.');
        return;
      }

      const { error: updateError } = await supabase
        .from('screens')
        .update({ is_paired: true, last_seen: new Date().toISOString() })
        .eq('id', screen.id);

      if (updateError) throw updateError;

      window.localStorage.setItem(STORED_SCREEN_KEY, screen.id);
      onNavigate(`/player/${screen.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not pair this player.');
    } finally {
      setIsPairing(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-slate-950 bg-cover bg-center px-6 text-white"
      style={{ backgroundImage: `linear-gradient(rgba(2, 6, 23, 0.30), rgba(2, 6, 23, 0.82)), url("${settings.playerBackgroundUrl}")` }}
    >
      <section className="w-full max-w-xl rounded-lg border border-slate-700 bg-slate-950/90 p-8 shadow-panel backdrop-blur-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-300/12 text-cyan-300">
            <MonitorPlay className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm uppercase tracking-wide text-cyan-200">{settings.brandName}</p>
            <h1 className="text-2xl font-semibold">Pair this screen</h1>
          </div>
        </div>

        <form onSubmit={pair} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">Pairing code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-4 text-center font-mono text-3xl text-white outline-none focus:border-cyan-300"
              inputMode="numeric"
              maxLength={12}
              placeholder="000000"
              required
            />
          </label>

          <button
            disabled={isPairing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
          >
            {isPairing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            Pair and start playback
          </button>
        </form>

        {savedScreenId && (
          <button
            onClick={() => onNavigate(`/player/${savedScreenId}`)}
            className="mt-4 w-full rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-300 hover:text-cyan-100"
            type="button"
          >
            Resume saved player
          </button>
        )}

        {error && <p className="mt-4 rounded-lg bg-rose-500/12 px-4 py-3 text-sm text-rose-200">{error}</p>}
      </section>
    </main>
  );
}
