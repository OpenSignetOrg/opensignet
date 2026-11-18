"""Compatibility CLI; all logic lives in the installed Python package."""

from opensignet_autogen.cli import main, parser, run

__all__ = ["main", "parser", "run"]

if __name__ == "__main__":
    main()
