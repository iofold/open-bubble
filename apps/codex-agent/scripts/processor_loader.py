from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PROCESSOR_PATH = SCRIPT_DIR / "process-context-request.py"


def load_processor() -> Any:
    spec = importlib.util.spec_from_file_location("open_bubble_context_processor", PROCESSOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load processor from {PROCESSOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module
