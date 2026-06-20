import { FormEvent, useState } from 'react';
import { Mail, MonitorPlay } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    setIsSending(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
        },
      });

      if (signInError) throw signInError;
      setMessage('Check your email for the sign-in link.');
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Could not send sign-in link.';
      setError(
        message.includes('Invalid path specified')
          ? 'Supabase URL looks incorrect. Use only your project API URL, like https://your-project-ref.supabase.co, then restart the dev server.'
          : message,
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-950 text-slate-100 lg:grid-cols-[1fr_0.9fr]">
      <section className="flex items-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="max-w-xl">
          <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-400/12 text-cyan-300">
            <MonitorPlay className="h-7 w-7" />
          </div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-cyan-200">
            Nehas Advertising
          </p>
          <h1 className="mb-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Nehas Advertising (ነሃስ ማስታወቂያ)
          </h1>
          <p className="text-base leading-7 text-slate-300">
            Upload Supabase-hosted media, pair TV players, arrange playback order, and keep displays
            healthy without touching the hardware.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center border-t border-slate-800 bg-slate-900/70 px-6 py-12 lg:border-l lg:border-t-0">
        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 p-6 shadow-panel">
          <h2 className="mb-2 text-2xl font-semibold text-white">Operator login</h2>
          <p className="mb-6 text-sm text-slate-400">Enter your email to receive a Supabase magic link.</p>

          <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="email">
            Email address
          </label>
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 focus-within:border-cyan-300">
            <Mail className="h-5 w-5 text-slate-400" />
            <input
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              placeholder="you@example.com"
              type="email"
              required
            />
          </div>

          <button
            disabled={isSending}
            className="flex w-full items-center justify-center rounded-lg bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
          >
            {isSending ? 'Sending link...' : 'Send sign-in link'}
          </button>

          {message && <p className="mt-4 rounded-lg bg-emerald-400/12 px-4 py-3 text-sm text-emerald-200">{message}</p>}
          {error && <p className="mt-4 rounded-lg bg-rose-500/12 px-4 py-3 text-sm text-rose-200">{error}</p>}
        </form>
      </section>
    </main>
  );
}
