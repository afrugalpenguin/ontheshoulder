# Garmin sidecar

Optional. Built in stage 8, and only if the stage 2 spike says go. The app is complete without it.

For now this directory only proves the toolchain: `main.py` prints the installed `garminconnect` version.

## Setup

With `uv`:

```
cd services/garmin
uv venv
uv pip install -e ".[dev]"
```

Without `uv`:

```
cd services/garmin
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"     # Windows
.venv/bin/python -m pip install -e ".[dev]"         # Linux, macOS
```

## Run

From `services/garmin`, using the interpreter in `.venv`:

```
python main.py
python -m ruff check .
python -m ruff format --check .
python -m pytest
```
