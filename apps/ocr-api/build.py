from __future__ import annotations

import subprocess
import sys


def run(args: list[str]) -> None:
    print(f"[ocr-api build] python -m pip {' '.join(args)}", flush=True)
    subprocess.run([sys.executable, "-m", "pip", *args], check=True)


def main() -> None:
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
