"""Standalone service reads only its own environment, not monolith secrets."""
import os


def read_env_var(name):
    return os.environ.get(name, "")
