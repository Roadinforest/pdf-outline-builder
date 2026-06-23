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
