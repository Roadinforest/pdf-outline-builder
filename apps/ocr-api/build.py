from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


ROOT_DIR = Path(__file__).resolve().parent
VENV_PYTHON = ROOT_DIR / ".vercel-python" / "bin" / "python"


def ensure_venv_python() -> None:
    if not VENV_PYTHON.exists():
        print(
            f"[ocr-api build] venv python not found at {VENV_PYTHON}; using {sys.executable}",
            flush=True,
        )
        return

    current = Path(sys.executable).resolve()
    target = VENV_PYTHON.resolve()
    if current == target:
        print(f"[ocr-api build] using venv python: {current}", flush=True)
        return

    print(
        f"[ocr-api build] re-execing inside venv: {current} -> {target}",
        flush=True,
    )
    os.execv(str(target), [str(target), *sys.argv])


def run(args: list[str]) -> None:
    print(f"[ocr-api build] python -m pip {' '.join(args)}", flush=True)
    subprocess.run([sys.executable, "-m", "pip", *args], check=True)


def main() -> None:
    ensure_venv_python()
    run(["uninstall", "-y", "opencv-python", "opencv-contrib-python", "opencv-contrib-python-headless", "opencv-python-headless"])
    run(["install", "--no-cache-dir", "--force-reinstall", "opencv-python-headless==4.13.0.92"])
    run(["list"])
    subprocess.run(
        [
            sys.executable,
            "-c",
            "import cv2; print('[ocr-api build] cv2 import ok:', cv2.__file__)",
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
