import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { errorText } from './api.js';
import { Placeholder } from './pages/Placeholder.js';
import { Settings } from './pages/Settings.js';
import { Today } from './pages/Today.js';
import { Week } from './pages/Week.js';
import { useSetupStatus } from './queries.js';
import { SetupWizard } from './setup/SetupWizard.js';
import { ExerciseLibrary } from './strength/ExerciseLibrary.js';
import { StrengthHome } from './strength/StrengthHome.js';
import { StrengthSession } from './strength/StrengthSession.js';
import { RestDemo } from './timer/RestDemo.js';
import { TimerPage } from './timer/TimerPage.js';

const TABS = [
  { to: '/', label: 'Today' },
  { to: '/week', label: 'Week' },
  { to: '/strength', label: 'Strength' },
  { to: '/trends', label: 'Trends' },
  { to: '/settings', label: 'Settings' },
] as const;

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function App() {
  const status = useSetupStatus();
  const { pathname } = useLocation();
  // The interval timer takes the whole screen.
  const fullScreen = pathname.startsWith('/timer/') && pathname !== '/timer/rest-demo';

  if (status.isPending) {
    return (
      <main>
        <p className="muted">Loading...</p>
      </main>
    );
  }
  if (status.isError) {
    return (
      <main>
        <h1>On the Shoulder</h1>
        <p role="alert" className="error">
          Cannot reach the api: {errorText(status.error)}
        </p>
        <button type="button" onClick={() => status.refetch()}>
          Try again
        </button>
      </main>
    );
  }
  if (!status.data.complete) return <SetupWizard dataDir={status.data.data_dir} />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/week" element={<Week />} />
        <Route path="/week/:isoWeek" element={<Week />} />
        <Route path="/strength" element={<StrengthHome />} />
        <Route path="/strength/day/:dayId" element={<StrengthSession />} />
        <Route path="/strength/exercises" element={<ExerciseLibrary />} />
        <Route
          path="/trends"
          element={
            <Placeholder
              title="Trends"
              note="Charts and the weekly review arrive in a later stage."
            />
          }
        />
        <Route path="/timer/rest-demo" element={<RestDemo />} />
        <Route path="/timer/:sessionId" element={<TimerPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!fullScreen && <TabBar />}
    </>
  );
}
