# PDF OCR API

FastAPI service for converting scanned/image-only PDFs into searchable PDFs with an OCR text layer.

The service is intentionally separate from `apps/api`: OCR depends on Python packages, RapidOCR, and the Poppler `pdftoppm` binary, while the existing app API stays a lightweight Hono service.

## Requirements

- Python 3.10+
- Poppler command line tools, especially `pdftoppm`

## Setup

```bash
cd apps/ocr-api
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

From the repo root, the same setup is available as:

```bash
pnpm run setup:ocr
```

## Vercel notes

The repository root and this app both include `.python-version` with `3.12`, while `pyproject.toml` allows Python `>=3.12,<3.13`. Vercel may resolve the Python version from different files depending on whether it uses `requirements.txt` or `uv` project mode. OCR dependencies such as `pyclipper` do not support Python 3.14, so this service must build with Python 3.12.

`rapidocr-onnxruntime` depends on `opencv-python`, whose normal wheel imports GUI-linked native libraries such as `libxcb`. Vercel's Python runtime does not provide those system libraries, so `build.py` swaps `opencv-python` for `opencv-python-headless` after dependency installation.

If `/` or `/health` returns a Vercel function import error mentioning `cv2` or `libxcb.so.1`, redeploy this service with the current `pyproject.toml`, `build.py`, and `requirements.txt` files.

For the Vercel project settings, use these overrides:

```bash
# Install Command
python3.12 -m venv .vercel-python && . .vercel-python/bin/activate && python -m pip install --upgrade pip && python -m pip install -r requirements.txt

# Build Command
. .vercel-python/bin/activate && python build.py
```

## Run

```bash
pnpm run dev:ocr
```

The default OCR API URL is:

```text
http://localhost:8000
```

The web app calls `POST /api/convert` and can be pointed somewhere else with:

```text
VITE_OCR_API_BASE_URL=http://localhost:8000
```

## API

```text
POST /api/convert
```

Multipart form fields:

- `file`: PDF file
- `dpi`: render DPI, default `160`
- `min_confidence`: OCR confidence threshold, default `0.35`
- `image_format`: `jpeg` or `png`, default `jpeg`
- `jpeg_quality`: JPEG quality, default `90`
