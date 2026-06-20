import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import AdminApp from './components/AdminApp';
import ConfigNotice from './components/ConfigNotice';
import LoginPage from './components/LoginPage';
import PlayerPairing from './components/PlayerPairing';
import PlayerScreen from './components/PlayerScreen';
import { missingEnv } from './lib/config';
import { useAuth } from './hooks/useAuth';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function navigate(path: string) {
  window.history.pushState({}, '', `${basePath}${path}` || '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function useRoute() {
  const getRoutePath = () => {
    const pathname = window.location.pathname;
    if (basePath && pathname.startsWith(basePath)) {
      return pathname.slice(basePath.length) || '/';
    }
    return pathname;
  };
  const [path, setPath] = useState(getRoutePath);

  useEffect(() => {
    const handleRoute = () => setPath(getRoutePath());
    window.addEventListener('popstate', handleRoute);
    return () => window.removeEventListener('popstate', handleRoute);
  }, []);

  return path;
}

export default function App() {
  const path = useRoute();
  const { session, isLoading } = useAuth();
  const playerScreenId = useMemo(() => {
    const match = path.match(/^\/player\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }, [path]);

  useEffect(() => {
    if (isLoading) return;
    if (path === '/') {
      navigate(session ? '/app' : '/login');
      return;
    }
    if (path === '/app' && !session) {
      navigate('/login');
      return;
    }
    if (path === '/login' && session) {
      navigate('/app');
    }
  }, [isLoading, path, session]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/80 px-5 py-4 shadow-panel">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          <span>Starting console</span>
        </div>
      </main>
    );
  }

  if (path === '/player') {
    return <PlayerPairing onNavigate={navigate} />;
  }

  if (playerScreenId) {
    return <PlayerScreen screenId={playerScreenId} onNavigate={navigate} />;
  }

  if (missingEnv.length > 0) {
    return <ConfigNotice missing={missingEnv} />;
  }

  if (path === '/login' || !session) {
    return <LoginPage />;
  }

  return <AdminApp onNavigate={navigate} session={session} />;
}
