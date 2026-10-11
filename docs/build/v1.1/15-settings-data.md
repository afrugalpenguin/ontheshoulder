# Stage 15: settings and data folder

Branch: `feat/settings-data`

The data folder must be configurable from the UI, and Settings needs the same cleanup the rest of the app got in stage 12.

## Do

1. **Config file, not env.** The api reads `OTS_CONFIG` (default `%LOCALAPPDATA%/ontheshoulder/config.json` on Windows, `~/.config/ontheshoulder/config.json` elsewhere). It holds `data_dir`, `port`, `lan_guard`, `log_level`. Env vars still override for dev and tests. If the file is missing the api writes it with defaults on first start.
2. **Data folder in Settings.** A Data section shows the current data folder, database size, last backup time, backup count. A "Change folder" action: the user enters a path (with a note that it must be on this PC); the api validates it is writable and not inside the repo tree; then it copies the database (online backup API) and the backups folder to the new location, verifies the copy opens and has the same row counts, updates `config.json`, and asks the user to restart the service. The old folder is left in place with a `MOVED-<date>.txt` marker; nothing is deleted. If any step fails, config is not changed and the error is shown.
3. **Restart affordance.** `POST /admin/restart` exits the process with code 0; the Task Scheduler job's restart-on-exit brings it back. In dev, the UI explains that the dev server must be restarted by hand. Settings shows "restart required" state after a folder change.
4. **Settings layout.** Sections as Cards in this order: Athlete and Event(s), Fixtures, Equipment, Habits and prompts, Blocks and rules, Data, About. Each collapsible, remembering state in localStorage. Use the stage 12 primitives throughout. Rules JSON editor keeps validation and dry run.
5. **About** card: version from `package.json`, licence, link to the repo, a "copy diagnostics" button that puts health output and config (with the data path) on the clipboard for bug reports.
6. **Export** moves under Data with the JSON and CSV buttons and the download-latest-backup button.
7. Runbook update for the config file and the move procedure.
8. Tests: config loading precedence (env over file over defaults), the move procedure against temp folders including a failure mid-copy leaving config unchanged, path validation rejecting the repo tree and non-writable paths.

## Do not

- Allow network paths or paths outside the local machine; reject UNC paths with a clear message.
- Delete anything in the old folder.

## Acceptance

- Fresh start with no config file: file is created with defaults; show it.
- Change the data folder from the phone to a new temp path: copy happens, row counts match, config updated, restart prompt shown, old folder has the marker. Show the api log lines.
- Simulated failure (make the target read-only after validation) leaves config unchanged and shows the error. Show it.
- Settings renders with every section collapsible and the state survives reload.
