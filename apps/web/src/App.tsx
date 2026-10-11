import { Suspense, lazy } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { errorText } from './api.js';
import { Placeholder } from './pages/Placeholder.js';
import { Week } from './pages/Week.js';
import { useSetupStatus } from './queries.js';
import { Button, ToastProvider } from './ui/index.js';

// Week is home and loads with the app. Every other screen loads when it is
// first opened, which keeps the first paint on a phone small.
const Trends = lazy(() => import('./trends/Trends.js').then((m) => ({ default: m.Trends })));
const Settings = lazy(() => import('./pages/Settings.js').then((m) => ({ default: m.Settings })));
const SetupWizard = lazy(() =>
  import('./setup/SetupWizard.js').then((m) => ({ default: m.SetupWizard })),
);
const StrengthHome = lazy(() =>
  import('./strength/StrengthHome.js').then((m) => ({ default: m.StrengthHome })),
);
const StrengthSession = lazy(() =>
  import('./strength/StrengthSession.js').then((m) => ({ default: m.StrengthSession })),
);
const ExerciseLibrary = lazy(() =>
  import('./strength/ExerciseLibrary.js').then((m) => ({ default: m.ExerciseLibrary })),
);
const TimerPage = lazy(() =>
  import('./timer/TimerPage.js').then((m) => ({ default: m.TimerPage })),
);
const RestDemo = lazy(() => import('./timer/RestDemo.js').then((m) => ({ default: m.RestDemo })));

// The component demo page exists only in development; the production build drops it.
const UiDemo = import.meta.env.DEV
  ? lazy(() => import('./dev/UiDemo.js').then((m) => ({ default: m.UiDemo })))
  : null;

const TABS = [
  { to: '/', label: 'Week' },
  { to: '/strength', label: 'Strength' },
  { to: '/trends', label: 'Trends' },
  { to: '/settings', label: 'Settings' },
] as const;

function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          // Another week is still the Week tab.
          {...(tab.to === '/' && pathname.startsWith('/week/')
            ? { 'aria-current': 'page' as const }
            : {})}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Loading() {
  return (
    <main>
      <p className="muted">Loading...</p>
    </main>
  );
}

export function App() {
  const status = useSetupStatus();
  const { pathname } = useLocation();
  // The interval timer takes the whole screen, and so does the component demo.
  const fullScreen =
    (pathname.startsWith('/timer/') && pathname !== '/timer/rest-demo') || pathname === '/dev/ui';

  if (status.isPending) return <Loading />;
  if (status.isError) {
    return (
      <main>
        <h1>On the Shoulder</h1>
        <p role="alert" className="error">
          Cannot reach the api: {errorText(status.error)}
        </p>
        <Button onClick={() => status.refetch()}>Try again</Button>
      </main>
    );
  }
  if (!status.data.complete) {
    return (
      <Suspense fallback={<Loading />}>
        <SetupWizard dataDir={status.data.data_dir} />
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Week />} />
          <Route path="/week/:isoWeek" element={<Week />} />
          <Route path="/strength" element={<StrengthHome />} />
          <Route path="/strength/day/:dayId" element={<StrengthSession />} />
          <Route path="/strength/exercises" element={<ExerciseLibrary />} />
          <Route
            path="/trends"
            element={
              <Suspense fallback={<Placeholder title="Trends" note="Loading..." />}>
                <Trends />
              </Suspense>
            }
          />
          <Route path="/timer/rest-demo" element={<RestDemo />} />
          <Route path="/timer/:sessionId" element={<TimerPage />} />
          <Route path="/settings" element={<Settings />} />
          {UiDemo && (
            <Route
              path="/dev/ui"
              element={
                <Suspense fallback={null}>
                  <UiDemo />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {!fullScreen && <TabBar />}
    </ToastProvider>
  );
}
