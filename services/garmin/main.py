"""Garmin sidecar placeholder. Prints the installed garminconnect version."""

from importlib.metadata import version


def library_version() -> str:
    return version("garminconnect")


def main() -> None:
    print(f"garminconnect {library_version()}")


if __name__ == "__main__":
    main()
