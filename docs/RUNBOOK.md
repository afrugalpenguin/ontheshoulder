# Runbook

How to install On the Shoulder on the PC, keep it running, and get out of trouble. Windows first, because that is what it was built on; Linux notes are at the end of each part.

Everything here uses three places:

| What | Where |
|---|---|
| The code | wherever you cloned the repo |
| Your data | the data folder: `%LOCALAPPDATA%\ontheshoulder` on Windows, `~/.local/share/ontheshoulder` on Linux, unless you have moved it (Settings, Data shows where it is) |
| Settings | the config file: `%LOCALAPPDATA%\ontheshoulder\config.json` on Windows, `~/.config/ontheshoulder/config.json` on Linux, or wherever `OTS_CONFIG` points |
| Settings | an optional `.env` in the repo root; see `.env.example` |

The data folder holds `ots.db` (the database), `backups\` and `logs\`. Nothing personal is ever written inside the repo.

## 1. First-time setup from clean

You need Node 22 or newer and git. Python is only for the optional Garmin sidecar.

```
git clone <your fork or the repo url> ontheshoulder
cd ontheshoulder
corepack enable          # once; puts the pinned pnpm on your path (may need an elevated shell)
pnpm install
pnpm build
```

Start it by hand the first time, so you can see it work:

```
pnpm --filter @ots/api start
```

It logs `database ready`, `backup written` and `Server listening`. Open `http://localhost:3001` on the PC. You should get the setup screen. The api is at `http://localhost:3001/api/health`.

Then make it start by itself:

```
.\scripts\install-tasks.ps1 -WhatIf     # shows what it will register
.\scripts\install-tasks.ps1
Start-ScheduledTask -TaskPath '\OnTheShoulder\' -TaskName 'OnTheShoulder Api'
```

That registers, for your user: the api at logon (restarted after a minute if it fails) and a weekly database vacuum. `.\scripts\uninstall-tasks.ps1` removes them. Both scripts can be run as often as you like.

Linux: copy `scripts/ontheshoulder.service` to `~/.config/systemd/user/`, set its `WorkingDirectory`, then `systemctl --user enable --now ontheshoulder`. The file has the full steps in its header.

### Find the PC's address and open it on the phone

On the PC:

```
ipconfig | findstr IPv4
```

Take the address that starts `192.168.` or `10.` (not a VPN adapter's). On Linux: `hostname -I`.

On the phone, on the same Wi-Fi, open `http://<that address>:3001`.

- If it does not load, allow Node through Windows Firewall for private networks: Windows Security, Firewall and network protection, Allow an app through firewall, tick Node.js for Private.
- The address can change when the router restarts. Give the PC a reserved address in the router's DHCP settings and the bookmark will keep working.

### Put it on the phone's home screen

- Android, Chrome: menu, Add to Home screen.
- iPhone, Safari: Share, Add to Home Screen.

It opens in the browser, as a bookmark. That is expected: there is no installable app in this version.

### Run the setup screen

Name, your A event, your kit, the week (start from the template or build by hand), then Finish. That plans the current week and lands on Today.

## 2. Daily operation

Nothing to do. The api starts at logon, takes a backup on start and at 02:00, and plans next week on Sunday at 21:00 (change the day and time in Settings, Athlete and events).

Useful checks:

| Check | How |
|---|---|
| Is it up? | `http://<pc>:3001/api/health` shows `ok`, the migration version, the last backup time and count |
| What is it doing? | the newest file in `<data folder>\logs`, or the task's history in Task Scheduler under `\OnTheShoulder\` |
| Stop or start it | `Stop-ScheduledTask` / `Start-ScheduledTask -TaskPath '\OnTheShoulder\' -TaskName 'OnTheShoulder Api'` |

### Updating

```
Stop-ScheduledTask -TaskPath '\OnTheShoulder\' -TaskName 'OnTheShoulder Api'
git pull
pnpm install
pnpm build
Start-ScheduledTask -TaskPath '\OnTheShoulder\' -TaskName 'OnTheShoulder Api'
```

Database migrations run by themselves when the api starts. A backup is taken on every start, so there is always one from just before an update took effect.

### Picking up what is new in the starter template

A migration changes settings an install already has. It does not add new sessions to your week: that is the starter template's job, and it is only applied when you ask. After an update that adds something to the template (v1.2 added the prehab session on Tuesday and Friday mornings), apply it again with the api running:

```
Invoke-RestMethod -Method Post http://localhost:3001/api/setup/apply-template/rebuild-100
```

or, on Linux, `curl -X POST http://localhost:3001/api/setup/apply-template/rebuild-100`.

The answer lists what was created; for v1.2 that is one session template and two fixtures. Everything is matched by name first, so nothing you have edited is overwritten, applying twice adds nothing the second time, and on an install that already has a week only the new sessions are put on their days: a session you took off your week is not put back.

Then open Week, Plan, "Regenerate this week" so the current week picks the new sessions up. Sessions already done, skipped or edited are kept. Weeks generated from then on have them by themselves.

### Settings you can change without touching code

- Settings, Blocks and rules: the progression rules of each block as JSON. It checks them as you type, shows what changed against the saved version, and "Dry run next week" shows the week they would produce without saving anything.
- Settings, Fixtures: which session falls on which day and slot.
- Settings, Data: where the data folder is (see "Move the data folder" below).
- The config file: data folder, port, LAN guard, log level. Restart the api after changing it.

### The config file

The api reads `config.json` on every start and writes it with defaults the first time, so there is always one to look at:

```
{
  "data_dir": "C:\\Users\\you\\AppData\\Local\\ontheshoulder",
  "port": 3001,
  "lan_guard": true,
  "log_level": "info"
}
```

- A key you leave out takes its default. A key it does not know, or a value of the wrong kind, stops the api at start with a message naming the key. It does not guess.
- Environment variables still win over the file, for development and tests: `OTS_DATA_DIR`, `OTS_PORT`, `OTS_LAN_GUARD`, `OTS_LOG_LEVEL`. `OTS_HOST` and `OTS_LOG_DIR` exist only as environment variables. Settings, About, "Copy diagnostics" lists any that are overriding the file.
- `OTS_CONFIG` points the api at a different config file.
- `db:migrate`, `db:vacuum` and `scripts\restore.ps1` find the data folder the same way the api does.

### Move the data folder

In Settings, Data, "Change folder":

1. Type the full path of a folder on this PC. A network share (`\\server\share`), a folder inside the app's own code, and a folder that already holds an `ots.db` are refused, with the reason.
2. The api copies the database (with SQLite's online backup, safe while the app is in use), opens the copy and checks every table has the same number of rows, copies the backups, and only then points the config file at the new folder.
3. It leaves a `MOVED-<date>.txt` in the old folder saying where the data went. Nothing in the old folder is deleted; remove it yourself once you are happy.
4. Settings shows "Restart required". The app keeps using the old folder until it restarts. "Restart now" ends the api and the scheduled task starts it again a couple of seconds later, on the new folder. Run with `pnpm dev` there is no task to do that, so the page tells you to restart by hand.

If any step fails, the config file is not changed, the half-made copy is removed, the error is shown, and the app carries on with the old folder. The steps are in the log (`data folder move: ...`).

Anything logged between the copy and the restart is in the old folder only, so restart straight after moving.

## 3. When Garmin sync goes red

Garmin sync is optional and, at the time of writing, not built: the app is complete without it. If you have added it:

1. Look at the message: Today shows the sidecar's last status, and `GET /api/import/garmin/status` returns it.
2. The usual cause is an expired login. Run the sidecar's login by hand once (`ots-garmin login`); it will ask for the MFA code.
3. Do not retry in a loop. Repeated failed logins can lock the Garmin account. The sidecar is written to stop at the first auth error for this reason.
4. Nothing else depends on it. Runs can always be logged by hand from Today, and a red Garmin strip never blocks anything.

To stop the red strip altogether, remove the task: `Unregister-ScheduledTask -TaskPath '\OnTheShoulder\' -TaskName 'OnTheShoulder Garmin Sync'`.

## 4. Restore a backup

Backups are in `<data folder>\backups`, named `ots-YYYYMMDD-HHmm.db`, the newest 30 kept. You can also download the latest from Settings, Data.

Check a backup opens, without touching anything live:

```
.\scripts\restore.ps1 -BackupFile "$env:LOCALAPPDATA\ontheshoulder\backups\ots-20310106-0200.db" -TargetPath C:\Temp\ots-check\ots.db
$env:OTS_DATA_DIR = 'C:\Temp\ots-check'; pnpm --filter @ots/api db:migrate; Remove-Item Env:OTS_DATA_DIR
```

`db:migrate` prints the database path and its migration version if the file is good.

Restore for real:

```
.\scripts\restore.ps1                       # the newest backup
.\scripts\restore.ps1 -BackupFile <path>    # a particular one
```

It asks you to type `RESTORE`, stops the api task, moves the current database aside as `ots.db.before-restore-<time>` (it is kept, not deleted), copies the backup into place and starts the api. If the result is wrong, the file it moved aside is your way back: stop the api, put it back as `ots.db`, start the api.

Linux: stop the service, copy the backup over `ots.db` (remove `ots.db-wal` and `ots.db-shm` if present), start the service.

## 5. Move the database to a new machine

1. On the old machine, in Settings, Data: "Back up now", then "Download latest backup". Or copy the newest file from `backups\`.
2. On the new machine, do part 1 as far as `pnpm build`. Do not run setup.
3. Put the backup in place:

```
.\scripts\restore.ps1 -BackupFile <the file you copied> -Force
```

   With no task registered yet it just copies the file to `<data folder>\ots.db`.
4. Start the api (`.\scripts\install-tasks.ps1`, then start the task). It opens the database, applies any newer migrations and carries on where the old machine left off. Setup does not appear, because the data is already there.
5. Give the phone the new address.

To leave the app altogether, Settings, Data has an Export part that gives you everything as JSON and each table as CSV.

## Security notes

- The api only answers loopback and private (LAN) addresses and returns 403 to anything else. `"lan_guard": false` in the config file (or `OTS_LAN_GUARD=false`) turns that off; do not, unless you know why.
- There are no accounts and no passwords. Anyone on your home network can open it. Do not forward its port on the router.
- It is plain http. That is why there is no installable app and why the screen may sleep during a timed walk; see `docs/BACKLOG.md` for the HTTPS option.
