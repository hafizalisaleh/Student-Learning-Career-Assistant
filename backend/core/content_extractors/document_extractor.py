"""
Document content extractors using Docling for structured document conversion.
Supports PDF, DOCX, PPTX, XLSX, HTML with table/formula/image preservation.
"""
import os
import re
import shutil
import subprocess
import tempfile
import logging
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import ImageRefMode

from config.settings import settings

logger = logging.getLogger(__name__)

DOCLING_FORMATS = {".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".html", ".htm"}


class DocumentExtractor:
    """Extract content from various document formats using Docling."""

    def __init__(self):
        self._pdf_to_image_bin = shutil.which("pdftoppm")
        self._ocr_bin = shutil.which("tesseract")
        self._logged_missing_ocr_deps = False

    def _build_docling_converter(self, file_ext: str, formula_enrichment: Optional[bool] = None) -> DocumentConverter:
        """Build a Docling converter using the same PDF export settings as the Docling CLI."""
        formula_enrichment = settings.DOCLING_FORMULA_ENRICHMENT if formula_enrichment is None else formula_enrichment
        if file_ext == ".pdf":
            pipeline_options = PdfPipelineOptions()
            pipeline_options.images_scale = settings.DOCLING_IMAGE_SCALE
            pipeline_options.generate_picture_images = settings.DOCLING_GENERATE_PICTURE_IMAGES
            pipeline_options.generate_table_images = settings.DOCLING_GENERATE_TABLE_IMAGES
            pipeline_options.do_formula_enrichment = formula_enrichment
            logger.info(
                "Docling PDF conversion configured (formula_enrichment=%s, image_scale=%s, picture_images=%s, table_images=%s)",
                formula_enrichment,
                settings.DOCLING_IMAGE_SCALE,
                settings.DOCLING_GENERATE_PICTURE_IMAGES,
                settings.DOCLING_GENERATE_TABLE_IMAGES,
            )
            return DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
                }
            )
        return DocumentConverter()

    def extract_with_docling(
        self,
        file_path: str,
        formula_enrichment: Optional[bool] = None
    ) -> Tuple[str, Optional[Any], Optional[str]]:
        """
        Extract document content using Docling. Returns structured markdown
        and the DoclingDocument object for downstream HybridChunker use.

        Args:
            file_path: Path to the document file
            formula_enrichment: Enable LaTeX formula extraction for PDFs

        Returns:
            Tuple of (markdown_content, docling_document, markdown_path).
            docling_document is None if Docling conversion fails or format unsupported.
        """
        file_ext = os.path.splitext(file_path)[1].lower()

        if file_ext not in DOCLING_FORMATS:
            # Non-Docling format: read as plain text
            plain_text, _ = self._extract_text_simple(file_path)
            return (plain_text, None, None)

        try:
            logger.info(f"Converting {file_ext} file using Docling: {os.path.basename(file_path)}")
            converter = self._build_docling_converter(file_ext, formula_enrichment)
            result = converter.convert(file_path)
            markdown_content, markdown_path = self._persist_docling_markdown(
                document=result.document,
                file_path=file_path,
            )
            logger.info(
                "Successfully converted %s to markdown (%s chars)%s",
                os.path.basename(file_path),
                len(markdown_content),
                f" [saved={markdown_path}]" if markdown_path else "",
            )
            return (markdown_content, result.document, markdown_path)
        except Exception as e:
            logger.error(f"Docling conversion failed for {file_path}: {e}")
            logger.warning(f"Falling back to plain text extraction for {file_path}")
            plain_text, _ = self._extract_text_simple(file_path)
            return (plain_text, None, None)

    def extract_pdf_page_ocr(
        self,
        file_path: str,
        dpi: int = 180,
        min_chars: int = 40
    ) -> List[Dict[str, Any]]:
        """
        Extract per-page OCR text from a PDF using pdftoppm + tesseract.

        Args:
            file_path: Path to PDF file
            dpi: Render DPI for page images
            min_chars: Minimum OCR characters required to keep a page

        Returns:
            List of dicts with 'text', 'page_number', and 'metadata' per page
        """
        if not file_path.lower().endswith(".pdf"):
            return []

        if not self._pdf_to_image_bin or not self._ocr_bin:
            if not self._logged_missing_ocr_deps:
                logger.warning(
                    "Skipping PDF page OCR: missing binaries (pdftoppm=%s, tesseract=%s)",
                    bool(self._pdf_to_image_bin), bool(self._ocr_bin)
                )
                self._logged_missing_ocr_deps = True
            return []

        pdf_path = Path(file_path).resolve()
        pages = []

        try:
            with tempfile.TemporaryDirectory(prefix="pdf-ocr-") as temp_dir:
                image_prefix = str(Path(temp_dir) / "page")
                subprocess.run(
                    [self._pdf_to_image_bin, "-png", "-r", str(dpi), str(pdf_path), image_prefix],
                    check=True, capture_output=True, text=True
                )

                page_images = sorted(
                    Path(temp_dir).glob("page-*.png"),
                    key=lambda p: self._extract_page_number(p.stem) or 0,
                )

                for image_path in page_images:
                    page_number = self._extract_page_number(image_path.stem)
                    if page_number is None:
                        continue

                    ocr_result = subprocess.run(
                        [self._ocr_bin, str(image_path), "stdout"],
                        check=False, capture_output=True, text=True
                    )
                    if ocr_result.returncode != 0:
                        continue

                    normalized = self._normalize_ocr_text(ocr_result.stdout)
                    if len(normalized) < min_chars:
                        continue

                    pages.append({
                        "text": normalized,
                        "page_number": page_number,
                        "metadata": {
                            "source_modality": "ocr_page",
                            "chunk_method": "pdf_page_ocr",
                            "ocr_engine": "tesseract",
                            "page_number": page_number,
                        }
                    })
        except subprocess.CalledProcessError as exc:
            logger.warning("PDF page OCR failed for %s: %s", pdf_path.name, str(exc).strip())

        return pages

    def _extract_text_simple(self, file_path: str) -> Tuple[str, None]:
        """Fallback: read file as plain text."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return (f.read(), None)
        except UnicodeDecodeError:
            with open(file_path, 'r', encoding='latin-1') as f:
                return (f.read(), None)
        except Exception as e:
            logger.error(f"Failed to read {file_path}: {e}")
            return (f"[Error: Could not read file {os.path.basename(file_path)}]", None)

    def extract_text(self, file_path: str) -> Optional[List[dict]]:
        """
        Extract text from file based on extension as segments/pages.
        Maintains backward compatibility with existing callers.

        Args:
            file_path: Path to file

        Returns:
            List of dictionaries containing 'text' and 'metadata'
        """
        ext = Path(file_path).suffix.lower()

        # Image files - return marker for vision processing
        image_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'}
        if ext in image_exts:
            return [{"text": f"__VISION_IMAGE__{file_path}__", "metadata": {"source": ext[1:]}}]

        # Use Docling for supported formats, plain text for others
        markdown_content, _, _ = self.extract_with_docling(file_path)

        if not markdown_content or markdown_content.startswith("[Error:"):
            return None

        return [{"text": markdown_content, "metadata": {"source": ext[1:]}}]

    def extract_title(self, content: str, file_path: str) -> str:
        """Extract title from document content or filename."""
        lines = content.split('\n')
        for line in lines[:10]:
            line = line.strip()
            if line.startswith('# '):
                return line[2:].strip()
        return os.path.splitext(os.path.basename(file_path))[0]

    def _persist_docling_markdown(self, document: Any, file_path: str) -> Tuple[str, Optional[str]]:
        """Save Docling markdown beside the source file and return its content."""
        source_path = Path(file_path).resolve()
        output_dir = source_path.parent / f"{source_path.name}.docling"
        output_dir.mkdir(parents=True, exist_ok=True)

        markdown_path = output_dir / "full.md"
        markdown_content = ""

        try:
            if hasattr(document, "save_as_markdown"):
                document.save_as_markdown(markdown_path, image_mode=ImageRefMode.REFERENCED)
                markdown_content = markdown_path.read_text(encoding="utf-8")
            else:
                markdown_content = document.export_to_markdown(image_mode=ImageRefMode.REFERENCED)
                markdown_path.write_text(markdown_content, encoding="utf-8")
        except TypeError:
            markdown_content = document.export_to_markdown()
            markdown_path.write_text(markdown_content, encoding="utf-8")
        except Exception:
            if markdown_path.exists():
                markdown_content = markdown_path.read_text(encoding="utf-8")
            else:
                raise

        return markdown_content, str(markdown_path)

    @staticmethod
    def _extract_page_number(stem: str) -> Optional[int]:
        """Extract trailing page number from rendered page filename."""
        match = re.search(r"-(\d+)$", stem)
        return int(match.group(1)) if match else None

    @staticmethod
    def _normalize_ocr_text(text: str) -> str:
        """Normalize OCR output to reduce whitespace noise."""
        normalized = text.replace("\r", "\n")
        normalized = re.sub(r"[ \t]+", " ", normalized)
        normalized = re.sub(r"\n{3,}", "\n\n", normalized)
        return normalized.strip()


# Global instance
document_extractor = DocumentExtractor()
