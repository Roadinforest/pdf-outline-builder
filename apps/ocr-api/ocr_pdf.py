#!/usr/bin/env python3
"""Convert image-only PDFs into searchable PDFs with an OCR text layer."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable

from PIL import Image
from pypdf import PdfReader
from rapidocr_onnxruntime import RapidOCR
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


FONT_NAME = "STSong-Light"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a scanned/image PDF into a searchable text-layer PDF."
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="test.pdf",
        help="input image-only PDF path, default: test.pdf",
    )
    parser.add_argument(
        "output",
        nargs="?",
        default="test_text.pdf",
        help="output searchable PDF path, default: test_text.pdf",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=160,
        help="rendering DPI used for OCR, default: 160",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.35,
        help="minimum OCR confidence to embed in the text layer, default: 0.35",
    )
    parser.add_argument(
        "--image-format",
        choices=("jpeg", "png"),
        default="jpeg",
        help="page image format embedded in the output PDF, default: jpeg",
    )
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=90,
        help="JPEG quality when --image-format jpeg is used, default: 90",
    )
    parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="keep rendered page images for debugging",
    )
    return parser.parse_args()


def require_pdftoppm() -> None:
    if shutil.which("pdftoppm") is None:
        raise RuntimeError(
            "Missing dependency: pdftoppm. Install Poppler, then run this command again."
        )


def render_page(
    input_pdf: Path,
    page_number: int,
    dpi: int,
    temp_dir: Path,
    image_format: str,
    jpeg_quality: int,
) -> Path:
    if not 1 <= jpeg_quality <= 100:
        raise ValueError("--jpeg-quality must be between 1 and 100")

    output_prefix = temp_dir / f"page-{page_number:04d}"
    format_args: list[str]
    suffix: str
    if image_format == "jpeg":
        format_args = ["-jpeg", "-jpegopt", f"quality={jpeg_quality}"]
        suffix = ".jpg"
    else:
        format_args = ["-png"]
        suffix = ".png"

    cmd = [
        "pdftoppm",
        "-r",
        str(dpi),
        *format_args,
        "-singlefile",
        "-f",
        str(page_number),
        "-l",
        str(page_number),
        str(input_pdf),
        str(output_prefix),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    rendered = output_prefix.with_suffix(suffix)
    if not rendered.exists():
        raise RuntimeError(f"Expected rendered page image was not created: {rendered}")
    return rendered


def page_sizes(input_pdf: Path) -> list[tuple[float, float]]:
    reader = PdfReader(str(input_pdf))
    sizes: list[tuple[float, float]] = []
    for page in reader.pages:
        box = page.mediabox
        sizes.append((float(box.width), float(box.height)))
    return sizes


def ocr_items(
    ocr_result: Iterable[list] | None,
    min_confidence: float,
) -> Iterable[tuple[list[list[float]], str, float]]:
    for item in ocr_result or []:
        if len(item) < 3:
            continue
        box, text, confidence = item[0], str(item[1]).strip(), float(item[2])
        if not text or confidence < min_confidence:
            continue
        yield box, text, confidence


def draw_invisible_text(
    pdf: canvas.Canvas,
    image_path: Path,
    page_width: float,
    page_height: float,
    ocr_result: Iterable[list] | None,
    min_confidence: float,
) -> int:
    with Image.open(image_path) as image:
        image_width, image_height = image.size

    embedded_count = 0
    for box, text, _confidence in ocr_items(ocr_result, min_confidence):
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]

        left = min(xs) / image_width * page_width
        right = max(xs) / image_width * page_width
        top = min(ys) / image_height * page_height
        bottom = max(ys) / image_height * page_height

        box_width = max(1.0, right - left)
        box_height = max(1.0, bottom - top)
        font_size = max(4.0, min(48.0, box_height * 0.86))
        baseline = page_height - bottom + (box_height * 0.12)

        text_width = pdfmetrics.stringWidth(text, FONT_NAME, font_size)
        horizontal_scale = 100.0
        if text_width > 0:
            horizontal_scale = max(20.0, min(200.0, (box_width / text_width) * 100.0))

        text_object = pdf.beginText()
        text_object.setTextRenderMode(3)
        text_object.setFont(FONT_NAME, font_size)
        text_object.setHorizScale(horizontal_scale)
        text_object.setTextOrigin(left, baseline)
        text_object.textLine(text)
        pdf.drawText(text_object)
        embedded_count += 1

    return embedded_count


def convert_pdf(
    input_pdf: Path,
    output_pdf: Path,
    dpi: int,
    min_confidence: float,
    image_format: str,
    jpeg_quality: int,
    keep_temp: bool,
) -> None:
    require_pdftoppm()
    if not input_pdf.exists():
        raise FileNotFoundError(f"Input PDF does not exist: {input_pdf}")

    pdfmetrics.registerFont(UnicodeCIDFont(FONT_NAME))
    sizes = page_sizes(input_pdf)
    if not sizes:
        raise RuntimeError(f"No pages found in {input_pdf}")

    ocr = RapidOCR()
    temp_context = tempfile.TemporaryDirectory(prefix="ocr-pdf-")
    temp_path = Path(temp_context.name)

    try:
        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        output = canvas.Canvas(str(output_pdf))

        for index, (page_width, page_height) in enumerate(sizes, start=1):
            print(f"[{index}/{len(sizes)}] Rendering page...", flush=True)
            image_path = render_page(
                input_pdf,
                index,
                dpi,
                temp_path,
                image_format,
                jpeg_quality,
            )

            print(f"[{index}/{len(sizes)}] OCR page...", flush=True)
            ocr_result, _elapsed = ocr(str(image_path))

            output.setPageSize((page_width, page_height))
            output.drawImage(
                str(image_path),
                0,
                0,
                width=page_width,
                height=page_height,
                preserveAspectRatio=False,
                mask="auto",
            )
            embedded = draw_invisible_text(
                output,
                image_path,
                page_width,
                page_height,
                ocr_result,
                min_confidence,
            )
            output.showPage()
            print(f"[{index}/{len(sizes)}] Embedded {embedded} text items.", flush=True)

        output.save()
    finally:
        if keep_temp:
            print(f"Temporary page images kept at: {temp_path}", flush=True)
        else:
            temp_context.cleanup()


def main() -> int:
    args = parse_args()
    try:
        convert_pdf(
            input_pdf=Path(args.input).resolve(),
            output_pdf=Path(args.output).resolve(),
            dpi=args.dpi,
            min_confidence=args.min_confidence,
            image_format=args.image_format,
            jpeg_quality=args.jpeg_quality,
            keep_temp=args.keep_temp,
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Done: {Path(args.output).resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
