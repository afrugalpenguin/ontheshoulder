import { NavLink, Navigate, Route, Routes } from 'react-router';
import { errorText } from './api.js';
import { Placeholder } from './pages/Placeholder.js';
import { Settings } from './pages/Settings.js';
import { Today } from './pages/Today.js';
import { Week } from './pages/Week.js';
import { useSetupStatus } from './queries.js';
import { SetupWizard } from './setup/SetupWizard.js';

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
        <Route
          path="/strength"
          element={
            <Placeholder
              title="Strength"
              note="Set-by-set strength logging arrives in a later stage."
            />
          }
        />
        <Route
          path="/trends"
          element={
            <Placeholder
              title="Trends"
              note="Charts and the weekly review arrive in a later stage."
            />
          }
        />
        <Route
          path="/timer/:sessionId"
          element={
            <Placeholder
              title="Timer"
              note="The interval timer arrives in a later stage. Log the session from Today for now."
            />
          }
        />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
  );
}
