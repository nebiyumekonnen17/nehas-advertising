import { AlertTriangle } from 'lucide-react';

type Props = {
  missing: string[];
};

export default function ConfigNotice({ missing }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-2xl rounded-lg border border-amber-400/30 bg-slate-900 p-8 shadow-panel">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-amber-400/12 p-3 text-amber-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-amber-200">
              Configuration needed
            </p>
            <h1 className="text-2xl font-semibold text-white">Environment values are missing</h1>
          </div>
        </div>

        <p className="mb-5 text-sm leading-6 text-slate-300">
          Add these keys to your local environment before running the console.
        </p>

        <ul className="space-y-2">
          {missing.map((key) => (
            <li key={key} className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-cyan-100">
              {key}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
