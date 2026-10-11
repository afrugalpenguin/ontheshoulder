import type { About, DataStatus, Health, MoveDataResult } from '@ots/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorText } from '../api.js';
import { keys, useHealth } from '../queries.js';
import { Button, Sheet, useToast } from '../ui/index.js';

const EXPORT_TABLES = [
  'activity',
  'daily_checkin',
  'body_metric',
  'planned_session',
  'strength_session',
  'set_log',
  'event',
  'block',
  'session_template',
  'fixture',
  'exercise',
  'programme_day',
  'programme_slot',
  'habit_definition',
  'equipment',
  'athlete',
  'week_plan',
];

const DATA_KEY = ['admin-data'] as const;
const ABOUT_KEY = ['admin-about'] as const;

/** 1536 becomes "1.5 kB". */
export function bytesText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const useData = (poll: boolean) =>
  useQuery({
    queryKey: DATA_KEY,
    queryFn: () => api<DataStatus>('GET', '/admin/data'),
    // While a restart is in flight, keep asking until the api is back.
    refetchInterval: poll ? 2000 : false,
    retry: poll ? 30 : 1,
  });

/** The sheet for choosing a new data folder. The api does every check; this shows what it says. */
function ChangeFolder(props: { current: string; onDone: (result: MoveDataResult) => void }) {
  const [path, setPath] = useState('');
  const move = useMutation({
    mutationFn: () => api<MoveDataResult>('POST', '/admin/data/move', { path }),
    onSuccess: props.onDone,
  });
  return (
    <form
      className="stack"
      aria-label="Change data folder"
      onSubmit={(e) => {
        e.preventDefault();
        move.mutate();
      }}
    >
      <p className="muted small">
        Now: <code>{props.current}</code>
      </p>
      <label>
        New folder
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="C:\Data\ontheshoulder"
        />
      </label>
      <p className="muted small">
        A full path to a folder on this PC, not a network share. The database and backups are copied
        there and checked. Nothing in the current folder is deleted.
      </p>
      {move.isError && (
        <p role="alert" className="error">
          {errorText(move.error)}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        loading={move.isPending}
        disabled={path.trim() === ''}
      >
        Copy and switch
      </Button>
    </form>
  );
}

/** Where the data lives and how to get it out: folder, size, backups, moving it, exports. */
export function DataSection() {
  const client = useQueryClient();
  const toast = useToast();
  const [restarting, setRestarting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [table, setTable] = useState(EXPORT_TABLES[0] as string);
  const data = useData(restarting);
  const backup = useMutation({
    mutationFn: () => api<{ file: string; count: number }>('POST', '/admin/backup'),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: DATA_KEY }),
        client.invalidateQueries({ queryKey: keys.health }),
      ]),
  });
  const restart = useMutation({
    mutationFn: () => api('POST', '/admin/restart'),
    onSuccess: () => setRestarting(true),
  });

  const status = data.data;
  if (!status) {
    return data.isError ? (
      <p role="alert" className="error">
        {errorText(data.error)}
      </p>
    ) : (
      <p className="muted">Loading...</p>
    );
  }
  // The api came back on the new folder: the restart is over.
  if (restarting && !status.restart_required) setRestarting(false);
  const fromEnv = status.env_overrides.includes('data_dir');

  return (
    <>
      <dl className="pairs" aria-label="Data folder">
        <dt>Folder</dt>
        <dd>
          <code>{status.data_dir}</code>
        </dd>
        <dt>Database</dt>
        <dd>{bytesText(status.db_bytes)}</dd>
        <dt>Last backup</dt>
        <dd>{status.backup.last ? new Date(status.backup.last).toLocaleString() : 'none yet'}</dd>
        <dt>Backups kept</dt>
        <dd>{status.backup.count}</dd>
      </dl>

      {status.restart_required && (
        <div className="notice" role="status" aria-label="Restart required">
          <p>
            <strong>Restart required.</strong> The data has been copied to{' '}
            <code>{status.configured_data_dir}</code>. The app keeps using the old folder until it
            restarts.
          </p>
          {status.can_restart ? (
            <Button
              variant="primary"
              loading={restart.isPending || restarting}
              onClick={() => restart.mutate()}
            >
              {restarting ? 'Restarting' : 'Restart now'}
            </Button>
          ) : (
            <p className="muted small">
              This is not running as the installed service, so it cannot restart itself. Stop the
              dev server and start it again by hand.
            </p>
          )}
          {restart.isError && (
            <p role="alert" className="error">
              {errorText(restart.error)}
            </p>
          )}
        </div>
      )}

      {fromEnv && (
        <p className="muted small">
          The folder is set by OTS_DATA_DIR in the environment, which overrides the config file.
          Remove it and restart to change the folder here.
        </p>
      )}

      <div className="row wrap">
        <Button disabled={fromEnv || status.config_path === null} onClick={() => setChanging(true)}>
          Change folder
        </Button>
        <Button loading={backup.isPending} onClick={() => backup.mutate()}>
          Back up now
        </Button>
        {status.backup.last && (
          <a className="button" href="/api/admin/backup/latest" download>
            Download latest backup
          </a>
        )}
      </div>
      {backup.isSuccess && (
        <p role="status" className="muted">
          Saved {backup.data.file}
        </p>
      )}
      {backup.isError && (
        <p role="alert" className="error">
          {errorText(backup.error)}
        </p>
      )}

      <h3>Export</h3>
      <div className="row wrap">
        <a className="button" href="/api/export/json" download>
          Download everything (JSON)
        </a>
      </div>
      <label>
        Table
        <select value={table} onChange={(e) => setTable(e.target.value)}>
          {EXPORT_TABLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <div className="row wrap">
        <a className="button" href={`/api/export/csv/${table}`} download>
          Download table (CSV)
        </a>
      </div>

      <Sheet open={changing} title="Change data folder" onClose={() => setChanging(false)}>
        <ChangeFolder
          current={status.data_dir}
          onDone={(result) => {
            setChanging(false);
            toast(`Copied ${result.rows} rows in ${result.tables} tables. Restart to switch.`);
            return client.invalidateQueries({ queryKey: DATA_KEY });
          }}
        />
      </Sheet>
    </>
  );
}

/** What a bug report needs: versions, health and the settings in force. No training data. */
export function diagnosticsText(about: About, health: Health, data: DataStatus): string {
  return JSON.stringify(
    {
      about,
      health,
      config: {
        config_path: data.config_path,
        data_dir: data.data_dir,
        configured_data_dir: data.configured_data_dir,
        port: data.port,
        lan_guard: data.lan_guard,
        log_level: data.log_level,
        env_overrides: data.env_overrides,
        restart_required: data.restart_required,
        db_bytes: data.db_bytes,
      },
      browser: navigator.userAgent,
    },
    null,
    2,
  );
}

/** Version, licence, where the code is, and a button that copies diagnostics for a bug report. */
export function AboutSection() {
  const toast = useToast();
  const about = useQuery({ queryKey: ABOUT_KEY, queryFn: () => api<About>('GET', '/admin/about') });
  const health = useHealth();
  const data = useData(false);
  const [shown, setShown] = useState<string | null>(null);

  if (!about.data) return <p className="muted">Loading...</p>;
  const ready = health.data && data.data;
  const copy = async () => {
    if (!health.data || !data.data) return;
    const text = diagnosticsText(about.data, health.data, data.data);
    try {
      // Only there on https or localhost; over plain http on the LAN it is not.
      await navigator.clipboard.writeText(text);
      toast('Diagnostics copied');
    } catch {
      setShown(text);
    }
  };

  return (
    <>
      <dl className="pairs" aria-label="About">
        <dt>Version</dt>
        <dd>{about.data.version}</dd>
        <dt>Licence</dt>
        <dd>{about.data.licence}</dd>
        {about.data.repository && (
          <>
            <dt>Code</dt>
            <dd>
              <a href={about.data.repository} rel="noreferrer">
                {about.data.repository.replace(/^https?:\/\//, '')}
              </a>
            </dd>
          </>
        )}
      </dl>
      <div className="row wrap">
        <Button disabled={!ready} onClick={() => void copy()}>
          Copy diagnostics
        </Button>
      </div>
      <p className="muted small">
        Version, health and settings, with the data folder path. No training data.
      </p>
      <Sheet open={shown !== null} title="Diagnostics" onClose={() => setShown(null)}>
        <p className="muted small">
          This browser would not copy for you. Select the text and copy it yourself.
        </p>
        <textarea
          className="rules-input"
          aria-label="Diagnostics text"
          readOnly
          rows={12}
          value={shown ?? ''}
          onFocus={(e) => e.target.select()}
        />
      </Sheet>
    </>
  );
}
