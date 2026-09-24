"""Test path setup. Production config and DB adapter are used without stubs."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
