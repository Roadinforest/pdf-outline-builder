from __future__ import annotations

import subprocess
import sys


def run(args: list[str]) -> None:
    subprocess.run([sys.executable, "-m", "pip", *args], check=True)


def main() -> None:
    run(["uninstall", "-y", "opencv-python"])
    run(["install", "--no-cache-dir", "opencv-python-headless==4.13.0.92"])


if __name__ == "__main__":
    main()
