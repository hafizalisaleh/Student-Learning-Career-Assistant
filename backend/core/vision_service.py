"""
Vision-aware RAG service adapted from docling-rag-agent.

This keeps SLCA's application schema intact while restoring the useful parts of
the original project:
- retrieval reranking with OCR-aware chunk handling
- on-demand Docling asset reconstruction into `.vision_cache`
- selective image analysis with Groq or Ollama
- markdown logging of question/answer/retrieval context
"""

import base64
import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from PIL import Image
from sqlalchemy import text as sql_text
from transformers import AutoTokenizer

from docling.chunking import HybridChunker
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import ImageRefMode, PictureItem

from config.database import SessionLocal
from config.settings import settings
from core.ingestion.chunker import (
    DEFAULT_HYBRID_MAX_TOKENS,
    DEFAULT_HYBRID_MERGE_PEERS,
    DEFAULT_HYBRID_TOKENIZER,
)
from core.ingestion.embedder import get_embedder
from utils.providers import (
    get_ollama_host,
    get_ollama_num_ctx,
    get_text_provider,
    get_vision_mode,
    get_vision_model,
    get_vision_provider,
    get_vision_responses_md,
)
from utils.rag_llm_client import RAGLLMClient

try:
    from groq import Groq
except ImportError:  # pragma: no cover
    Groq = None  # type: ignore

try:
    from ollama import Client as OllamaClient, ResponseError
except ImportError:  # pragma: no cover
    OllamaClient = None  # type: ignore
    ResponseError = Exception  # type: ignore

logger = logging.getLogger(__name__)

DEFAULT_CACHE_DIR = ".vision_cache"
DOC_ASSET_SUFFIXES = {
    ".pdf",
    ".docx",
    ".doc",
    ".pptx",
    ".ppt",
    ".xlsx",
    ".xls",
    ".html",
    ".htm",
}
VISION_QUERY_HINTS = (
    "image",
    "images",
    "figure",
    "figures",
    "chart",
    "graph",
    "diagram",
    "screenshot",
    "picture",
    "photo",
    "visual",
    "see",
    "shown",
    "read the image",
    "read the chart",
)
OCR_READOUT_HINTS = (
    "read the image",
    "read this image",
    "read the figure",
    "read this figure",
    "read the screenshot",
    "extract text",
    "extract the text",
    "transcribe",
    "ocr text",
    "exact text",
    "verbatim",
    "what does the page say",
    "what does the scan say",
)
QUERY_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "what",
    "which",
    "would",
    "should",
    "most",
    "appropriate",
    "state",
    "identify",
    "explain",
    "variable",
    "variables",
    "researcher",
    "following",
}


@dataclass
class RetrievedChunk:
    chunk_id: str
    document_id: str
    content: str
    chunk_index: int
    similarity: float
    chunk_metadata: Dict[str, Any]
    document_title: str
    document_source: str
    document_metadata: Dict[str, Any]


@dataclass
class TableAsset:
    asset_ref: str
    page_no: Optional[int]
    markdown: str


@dataclass
class ImageAsset:
    asset_ref: str
    page_no: Optional[int]
    file_path: Path
    caption: str = ""


@dataclass
class ChunkAssetLinks:
    page_numbers: List[int] = field(default_factory=list)
    direct_table_refs: List[str] = field(default_factory=list)
    table_refs: List[str] = field(default_factory=list)
    direct_image_refs: List[str] = field(default_factory=list)
    image_refs: List[str] = field(default_factory=list)


@dataclass
class DoclingAssetCatalog:
    source_path: Path
    markdown_path: Optional[Path]
    tables: Dict[str, TableAsset]
    images: Dict[str, ImageAsset]
    chunk_links: Dict[int, ChunkAssetLinks]


@dataclass
class LinkedImage:
    image: ImageAsset
    match_source: str
    context_excerpt: str = ""
    source_chunk_index: Optional[int] = None
    relevance_score: float = 0.0


@dataclass
class EnrichedChunk:
    chunk: RetrievedChunk
    markdown_path: Optional[Path]
    page_numbers: List[int]
    tables: List[TableAsset]
    images: List[LinkedImage]


def dedupe_preserve_order(values: List[str]) -> List[str]:
    seen: Set[str] = set()
    deduped: List[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            deduped.append(value)
    return deduped


def truncate_text(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def clean_structured_response(content: str) -> str:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")
    return slug or "document"


def normalize_json_value(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            loaded = json.loads(value)
            if isinstance(loaded, dict):
                return loaded
        except json.JSONDecodeError:
            return {}
    return {}


def extract_metadata_pages(metadata: Dict[str, Any]) -> List[int]:
    pages: List[int] = []
    page_number = metadata.get("page_number")
    if isinstance(page_number, int):
        pages.append(page_number)
    page_numbers = metadata.get("page_numbers")
    if isinstance(page_numbers, list):
        pages.extend(page for page in page_numbers if isinstance(page, int))
    return sorted(set(pages))


def extract_metadata_refs(metadata: Dict[str, Any], key: str) -> List[str]:
    values = metadata.get(key)
    if not isinstance(values, list):
        return []
    refs = [str(value).strip() for value in values if str(value).strip()]
    return dedupe_preserve_order(refs)


def chunk_modality(metadata: Dict[str, Any]) -> str:
    return str(metadata.get("source_modality") or metadata.get("chunk_method") or "").strip()


def supports_docling_assets(path: Path) -> bool:
    return path.suffix.lower() in DOC_ASSET_SUFFIXES


def extract_caption_text(item: Any, document: Any) -> str:
    caption = getattr(item, "caption_text", "")
    if callable(caption):
        try:
            caption = caption(document)
        except TypeError:
            caption = caption()
    return str(caption or "").strip()


def extract_page_numbers(item: Any) -> List[int]:
    page_numbers: List[int] = []
    for prov in getattr(item, "prov", []) or []:
        page_no = getattr(prov, "page_no", None)
        if page_no is not None:
            page_numbers.append(page_no)
    return sorted(set(page_numbers))


def question_needs_vision(question: str) -> bool:
    normalized = question.lower()
    return any(
        (hint in normalized if " " in hint else re.search(rf"\b{re.escape(hint)}\b", normalized) is not None)
        for hint in VISION_QUERY_HINTS
    )


def question_requests_page_readout(question: str) -> bool:
    normalized = question.lower()
    return any(
        (hint in normalized if " " in hint else re.search(rf"\b{re.escape(hint)}\b", normalized) is not None)
        for hint in OCR_READOUT_HINTS
    )


def extract_query_terms(query: str) -> List[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9_]+", query.lower())
    return [token for token in tokens if len(token) > 2 and token not in QUERY_STOPWORDS]


def extract_query_phrases(query_terms: List[str]) -> List[str]:
    phrases: List[str] = []
    for n in (2, 3):
        for index in range(len(query_terms) - n + 1):
            phrases.append(" ".join(query_terms[index:index + n]))
    return phrases


def extract_json_block(content: str) -> Optional[str]:
    cleaned = clean_structured_response(content)
    if not cleaned:
        return None

    for opening, closing in (("{", "}"), ("[", "]")):
        start = cleaned.find(opening)
        if start == -1:
            continue

        depth = 0
        in_string = False
        escape = False
        for index in range(start, len(cleaned)):
            char = cleaned[index]
            if in_string:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
                continue
            if char == opening:
                depth += 1
            elif char == closing:
                depth -= 1
                if depth == 0:
                    return cleaned[start:index + 1]
    return None


def decode_data_url_image(data_url: str) -> bytes:
    if not data_url or not isinstance(data_url, str):
        raise ValueError("Selected image payload is empty")

    if "," not in data_url:
        raise ValueError("Selected image payload must be a data URL")

    header, encoded = data_url.split(",", 1)
    if ";base64" not in header:
        raise ValueError("Selected image payload must be base64 encoded")

    return base64.b64decode(encoded)


class DoclingAssetManager:
    """Loads Docling documents on demand and extracts linked tables/images."""

    def __init__(
        self,
        cache_dir: str = DEFAULT_CACHE_DIR,
        image_scale: float = 1.5,
        chunk_max_tokens: int = DEFAULT_HYBRID_MAX_TOKENS,
        merge_peers: bool = DEFAULT_HYBRID_MERGE_PEERS,
        tokenizer_model: str = DEFAULT_HYBRID_TOKENIZER,
        formula_enrichment: bool = False,
    ):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.image_scale = image_scale
        self.formula_enrichment = formula_enrichment
        self.catalog_cache: Dict[str, DoclingAssetCatalog] = {}
        self.tokenizer = AutoTokenizer.from_pretrained(tokenizer_model)
        self.chunker = HybridChunker(
            tokenizer=self.tokenizer,
            max_tokens=chunk_max_tokens,
            merge_peers=merge_peers,
        )

    def get_catalog(self, source_path: Path) -> Optional[DoclingAssetCatalog]:
        resolved_path = source_path.resolve()
        if not resolved_path.exists() or not supports_docling_assets(resolved_path):
            return None

        cache_key = str(resolved_path)
        if cache_key not in self.catalog_cache:
            self.catalog_cache[cache_key] = self._build_catalog(resolved_path)
        return self.catalog_cache[cache_key]

    def _build_converter(self) -> DocumentConverter:
        pipeline_options = PdfPipelineOptions()
        pipeline_options.images_scale = self.image_scale
        pipeline_options.generate_picture_images = settings.DOCLING_GENERATE_PICTURE_IMAGES
        pipeline_options.generate_table_images = settings.DOCLING_GENERATE_TABLE_IMAGES
        pipeline_options.do_formula_enrichment = self.formula_enrichment
        return DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            }
        )

    def _build_catalog(self, source_path: Path) -> DoclingAssetCatalog:
        converter = self._build_converter()
        conversion_result = converter.convert(source_path)
        document = conversion_result.document

        source_digest = hashlib.sha1(str(source_path.resolve()).encode("utf-8")).hexdigest()[:10]
        output_dir = self.cache_dir / f"{slugify(source_path.stem)}-{source_digest}"
        output_dir.mkdir(parents=True, exist_ok=True)

        markdown_path = output_dir / "full.md"
        try:
            if hasattr(document, "save_as_markdown"):
                document.save_as_markdown(markdown_path, image_mode=ImageRefMode.REFERENCED)
            else:
                markdown = document.export_to_markdown(image_mode=ImageRefMode.REFERENCED)
                markdown_path.write_text(markdown, encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to save rich markdown for %s: %s", source_path.name, exc)
            markdown_path = None

        order_entries = []
        for order_index, (element, _level) in enumerate(document.iterate_items()):
            element_ref = getattr(element, "self_ref", None)
            if not element_ref:
                continue
            label = getattr(getattr(element, "label", None), "value", "")
            order_entries.append(
                {
                    "index": order_index,
                    "ref": element_ref,
                    "label": label,
                    "pages": extract_page_numbers(element),
                    "element": element,
                }
            )

        tables: Dict[str, TableAsset] = {}
        for table in getattr(document, "tables", []) or []:
            asset_ref = getattr(table, "self_ref", "")
            if not asset_ref:
                continue
            try:
                markdown = table.export_to_markdown(doc=document)
            except Exception:
                markdown = ""
            pages = extract_page_numbers(table)
            tables[asset_ref] = TableAsset(
                asset_ref=asset_ref,
                page_no=pages[0] if pages else None,
                markdown=markdown.strip(),
            )

        images: Dict[str, ImageAsset] = {}
        picture_count = 0
        for entry in order_entries:
            element = entry["element"]
            if not isinstance(element, PictureItem):
                continue
            picture_count += 1
            image_path = output_dir / f"image-{picture_count}.png"
            try:
                image = element.get_image(document)
                image.save(image_path, "PNG")
            except Exception as exc:
                logger.warning("Failed to export image %s: %s", entry["ref"], exc)
                continue
            images[entry["ref"]] = ImageAsset(
                asset_ref=entry["ref"],
                page_no=entry["pages"][0] if entry["pages"] else None,
                file_path=image_path,
                caption=extract_caption_text(element, document),
            )

        chunk_links = self._build_chunk_links(document, order_entries)

        return DoclingAssetCatalog(
            source_path=source_path,
            markdown_path=markdown_path,
            tables=tables,
            images=images,
            chunk_links=chunk_links,
        )

    def _build_chunk_links(
        self,
        document: Any,
        order_entries: List[Dict[str, Any]],
    ) -> Dict[int, ChunkAssetLinks]:
        order_index = {entry["ref"]: entry["index"] for entry in order_entries}
        chunk_links: Dict[int, ChunkAssetLinks] = {}

        for chunk_index, chunk in enumerate(self.chunker.chunk(dl_doc=document)):
            positions: List[int] = []
            page_numbers: Set[int] = set()
            direct_table_refs: List[str] = []
            direct_image_refs: List[str] = []

            for doc_item in chunk.meta.doc_items:
                item_ref = getattr(doc_item, "self_ref", None)
                if item_ref in order_index:
                    positions.append(order_index[item_ref])

                label = getattr(getattr(doc_item, "label", None), "value", "")
                if label == "table":
                    direct_table_refs.append(item_ref)
                elif label == "picture":
                    direct_image_refs.append(item_ref)

                page_numbers.update(extract_page_numbers(doc_item))

            table_refs = dedupe_preserve_order(direct_table_refs)
            if not table_refs:
                table_refs.extend(
                    self._find_nearby_asset_refs(
                        order_entries,
                        positions,
                        page_numbers,
                        asset_label="table",
                        max_results=1,
                        window=4,
                    )
                )

            image_refs = dedupe_preserve_order(direct_image_refs)
            if not image_refs:
                image_refs.extend(
                    self._find_nearby_asset_refs(
                        order_entries,
                        positions,
                        page_numbers,
                        asset_label="picture",
                        max_results=2,
                        window=6,
                    )
                )

            chunk_links[chunk_index] = ChunkAssetLinks(
                page_numbers=sorted(page_numbers),
                direct_table_refs=dedupe_preserve_order(direct_table_refs),
                table_refs=dedupe_preserve_order(table_refs),
                direct_image_refs=dedupe_preserve_order(direct_image_refs),
                image_refs=dedupe_preserve_order(image_refs),
            )

        return chunk_links

    def _find_nearby_asset_refs(
        self,
        order_entries: List[Dict[str, Any]],
        positions: List[int],
        page_numbers: Set[int],
        asset_label: str,
        max_results: int,
        window: int,
    ) -> List[str]:
        if not positions:
            return []

        start = max(0, min(positions) - window)
        end = min(len(order_entries), max(positions) + window + 1)
        refs: List[str] = []
        for entry in order_entries[start:end]:
            if entry["label"] != asset_label:
                continue
            if page_numbers and entry["pages"] and not set(entry["pages"]).intersection(page_numbers):
                continue
            refs.append(entry["ref"])
            if len(refs) >= max_results:
                break
        return refs


class VisionService:
    """Vision-aware retrieval and answer generation for SLCA."""

    def __init__(self):
        self.embedder = get_embedder()
        self.asset_manager = DoclingAssetManager(
            cache_dir=settings.VISION_CACHE_DIR or DEFAULT_CACHE_DIR,
            image_scale=settings.DOCLING_IMAGE_SCALE,
            chunk_max_tokens=settings.DOCLING_HYBRID_MAX_TOKENS,
            merge_peers=settings.DOCLING_HYBRID_MERGE_PEERS,
            tokenizer_model=settings.DOCLING_HYBRID_TOKENIZER,
            formula_enrichment=settings.DOCLING_FORMULA_ENRICHMENT,
        )
        self.text_provider = get_text_provider()
        self.vision_provider = get_vision_provider()
        self.vision_mode = get_vision_mode()
        self.text_client = RAGLLMClient(provider=self.text_provider)
        self.text_model = self.text_client.model
        self.vision_model = get_vision_model(self.vision_provider)
        self.max_vision_images = settings.VISION_MAX_IMAGES
        self.ollama_host = get_ollama_host()
        self.ollama_num_ctx = get_ollama_num_ctx()
        self.responses_md_path = Path(get_vision_responses_md()).resolve()
        self.responses_md_path.parent.mkdir(parents=True, exist_ok=True)
        self.selection_cache_dir = Path(settings.VISION_CACHE_DIR or DEFAULT_CACHE_DIR).resolve() / "selected_regions"
        self.selection_cache_dir.mkdir(parents=True, exist_ok=True)
        self.session_started_at = datetime.now().astimezone()
        self.responses_session_logged = False
        self.query_count = 0

        self.groq_client = None
        self.ollama_client = None
        if self.vision_provider == "groq" and settings.GROQ_API_KEY and Groq is not None:
            self.groq_client = Groq(api_key=settings.GROQ_API_KEY)
        elif self.vision_provider == "ollama" and OllamaClient is not None:
            self.ollama_client = OllamaClient(host=self.ollama_host)

    def _links_from_chunk_metadata(self, metadata: Dict[str, Any]) -> ChunkAssetLinks:
        return ChunkAssetLinks(
            page_numbers=extract_metadata_pages(metadata),
            direct_table_refs=extract_metadata_refs(metadata, "direct_table_refs"),
            table_refs=extract_metadata_refs(metadata, "table_refs"),
            direct_image_refs=extract_metadata_refs(metadata, "direct_image_refs"),
            image_refs=extract_metadata_refs(metadata, "image_refs"),
        )

    def _limit_ocr_chunks(self, chunks: List[RetrievedChunk], limit: int) -> List[RetrievedChunk]:
        max_ocr_chunks = max(1, limit // 3)
        selected: List[RetrievedChunk] = []
        selected_ids: Set[str] = set()
        ocr_count = 0

        for chunk in chunks:
            if len(selected) >= limit:
                break
            is_ocr_chunk = chunk_modality(chunk.chunk_metadata) == "ocr_page"
            if is_ocr_chunk and ocr_count >= max_ocr_chunks:
                continue
            selected.append(chunk)
            selected_ids.add(chunk.chunk_id)
            if is_ocr_chunk:
                ocr_count += 1

        if len(selected) < limit:
            for chunk in chunks:
                if len(selected) >= limit:
                    break
                if chunk.chunk_id in selected_ids:
                    continue
                selected.append(chunk)
                selected_ids.add(chunk.chunk_id)

        return selected

    def _rerank_chunks(
        self,
        query: str,
        chunks: List[RetrievedChunk],
        limit: int,
        preferred_page: Optional[int] = None,
    ) -> List[RetrievedChunk]:
        query_terms = extract_query_terms(query)
        query_phrases = extract_query_phrases(query_terms)
        page_readout_query = question_requests_page_readout(query)

        def score(chunk: RetrievedChunk) -> float:
            content = chunk.content.lower()
            term_hits = sum(1 for term in set(query_terms) if term in content)
            phrase_hits = sum(1 for phrase in set(query_phrases) if phrase in content)
            modality = chunk_modality(chunk.chunk_metadata)
            modality_boost = 0.0
            if modality == "ocr_page":
                if page_readout_query:
                    modality_boost = 0.08 + (0.05 * min(term_hits, 3))
                else:
                    modality_boost = -0.12
            elif modality and not page_readout_query:
                modality_boost = 0.05
            page_boost = 0.0
            if preferred_page is not None:
                page_numbers = extract_metadata_pages(chunk.chunk_metadata)
                if preferred_page in page_numbers:
                    page_boost = 0.65
                elif page_numbers and any(abs(page - preferred_page) == 1 for page in page_numbers):
                    page_boost = 0.15
            return chunk.similarity + (0.04 * term_hits) + (0.1 * phrase_hits) + modality_boost + page_boost

        ranked = sorted(chunks, key=score, reverse=True)
        if page_readout_query:
            return ranked[:limit]
        return self._limit_ocr_chunks(ranked, limit)

    def _retrieve_page_chunks(
        self,
        document_id: str,
        user_id: Optional[str],
        preferred_page: int,
        limit: int,
    ) -> List[RetrievedChunk]:
        db = SessionLocal()
        try:
            rows = db.execute(
                sql_text(
                    """
                    SELECT
                        c.id::text AS chunk_id,
                        c.document_id::text AS document_id,
                        c.content,
                        c.chunk_index,
                        c.metadata AS chunk_metadata,
                        d.title AS document_title,
                        COALESCE(d.file_path, d.original_filename, d.title) AS document_source,
                        d.doc_metadata AS document_metadata,
                        0.0 AS similarity
                    FROM chunks c
                    JOIN documents d ON d.id = c.document_id
                    WHERE c.embedding IS NOT NULL
                      AND c.document_id = CAST(:document_id AS uuid)
                      AND (:user_id IS NULL OR d.user_id = CAST(:user_id AS uuid))
                      AND (
                        EXISTS (
                          SELECT 1
                          FROM jsonb_array_elements_text(COALESCE(c.metadata->'page_numbers', '[]'::jsonb)) AS page_value
                          WHERE page_value::int = :preferred_page
                        )
                        OR (
                          (c.metadata->>'page_number') IS NOT NULL
                          AND (c.metadata->>'page_number') ~ '^[0-9]+$'
                          AND (c.metadata->>'page_number')::int = :preferred_page
                        )
                      )
                    ORDER BY c.chunk_index
                    LIMIT :limit
                    """
                ),
                {
                    "document_id": document_id,
                    "user_id": user_id,
                    "preferred_page": preferred_page,
                    "limit": limit,
                },
            )

            return [
                RetrievedChunk(
                    chunk_id=row.chunk_id,
                    document_id=row.document_id,
                    content=row.content,
                    chunk_index=row.chunk_index,
                    similarity=float(row.similarity or 0.0),
                    chunk_metadata=normalize_json_value(row.chunk_metadata),
                    document_title=row.document_title or "Untitled document",
                    document_source=row.document_source or "",
                    document_metadata=normalize_json_value(row.document_metadata),
                )
                for row in rows
            ]
        finally:
            db.close()

    def retrieve_chunks(
        self,
        query: str,
        document_id: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 5,
        preferred_page: Optional[int] = None,
    ) -> List[RetrievedChunk]:
        query_embedding = self.embedder.generate_query_embedding(query)
        embedding_str = "[" + ",".join(map(str, query_embedding)) + "]"
        candidate_limit = max(limit * 8, 24)

        db = SessionLocal()
        try:
            rows = db.execute(
                sql_text(
                    """
                    SELECT
                        c.id::text AS chunk_id,
                        c.document_id::text AS document_id,
                        c.content,
                        c.chunk_index,
                        c.metadata AS chunk_metadata,
                        d.title AS document_title,
                        COALESCE(d.file_path, d.original_filename, d.title) AS document_source,
                        d.doc_metadata AS document_metadata,
                        1 - (c.embedding <=> CAST(:query_embedding AS vector)) AS similarity
                    FROM chunks c
                    JOIN documents d ON d.id = c.document_id
                    WHERE c.embedding IS NOT NULL
                      AND (:document_id IS NULL OR c.document_id = CAST(:document_id AS uuid))
                      AND (:user_id IS NULL OR d.user_id = CAST(:user_id AS uuid))
                    ORDER BY c.embedding <=> CAST(:query_embedding AS vector)
                    LIMIT :limit
                    """
                ),
                {
                    "query_embedding": embedding_str,
                    "document_id": document_id,
                    "user_id": user_id,
                    "limit": candidate_limit,
                },
            )

            retrieved_chunks = [
                RetrievedChunk(
                    chunk_id=row.chunk_id,
                    document_id=row.document_id,
                    content=row.content,
                    chunk_index=row.chunk_index,
                    similarity=float(row.similarity or 0.0),
                    chunk_metadata=normalize_json_value(row.chunk_metadata),
                    document_title=row.document_title or "Untitled document",
                    document_source=row.document_source or "",
                    document_metadata=normalize_json_value(row.document_metadata),
                )
                for row in rows
            ]
            if preferred_page is not None and document_id:
                page_chunks = self._retrieve_page_chunks(
                    document_id=document_id,
                    user_id=user_id,
                    preferred_page=preferred_page,
                    limit=max(limit * 4, 12),
                )
                existing_ids = {chunk.chunk_id for chunk in retrieved_chunks}
                for page_chunk in page_chunks:
                    if page_chunk.chunk_id not in existing_ids:
                        retrieved_chunks.append(page_chunk)
                        existing_ids.add(page_chunk.chunk_id)

            return self._rerank_chunks(query, retrieved_chunks, limit, preferred_page=preferred_page)
        finally:
            db.close()

    def resolve_source_path(self, chunk: RetrievedChunk) -> Optional[Path]:
        source_path = chunk.document_metadata.get("file_path")
        if source_path:
            resolved = Path(source_path)
            if resolved.exists():
                return resolved.resolve()

        fallback = Path(chunk.document_source)
        if fallback.exists():
            return fallback.resolve()

        return None

    def enrich_chunks(self, chunks: List[RetrievedChunk]) -> List[EnrichedChunk]:
        enriched: List[EnrichedChunk] = []
        for chunk in chunks:
            source_path = self.resolve_source_path(chunk)
            markdown_path: Optional[Path] = None
            linked_tables: List[TableAsset] = []
            linked_images: List[LinkedImage] = []
            page_numbers = extract_metadata_pages(chunk.chunk_metadata)

            if source_path and supports_docling_assets(source_path):
                catalog = self.asset_manager.get_catalog(source_path)
                if catalog is not None:
                    markdown_path = catalog.markdown_path
                    metadata_links = self._links_from_chunk_metadata(chunk.chunk_metadata)
                    links = metadata_links
                    if not (
                        metadata_links.direct_table_refs
                        or metadata_links.table_refs
                        or metadata_links.direct_image_refs
                        or metadata_links.image_refs
                        or metadata_links.page_numbers
                    ):
                        links = catalog.chunk_links.get(chunk.chunk_index, ChunkAssetLinks())
                    page_numbers = links.page_numbers or page_numbers
                    if links.direct_table_refs:
                        linked_tables = [
                            catalog.tables[asset_ref]
                            for asset_ref in links.direct_table_refs
                            if asset_ref in catalog.tables
                        ][:2]
                    elif links.table_refs:
                        linked_tables = [
                            catalog.tables[asset_ref]
                            for asset_ref in links.table_refs
                            if asset_ref in catalog.tables
                        ][:2]

                    context_excerpt = truncate_text(chunk.content, 900)
                    if links.direct_image_refs:
                        linked_images = [
                            LinkedImage(
                                image=catalog.images[asset_ref],
                                match_source="direct_chunk",
                                context_excerpt=context_excerpt,
                                source_chunk_index=chunk.chunk_index,
                            )
                            for asset_ref in links.direct_image_refs
                            if asset_ref in catalog.images
                        ][:2]
                    elif links.image_refs:
                        linked_images = [
                            LinkedImage(
                                image=catalog.images[asset_ref],
                                match_source="nearby_chunk",
                                context_excerpt=context_excerpt,
                                source_chunk_index=chunk.chunk_index,
                            )
                            for asset_ref in links.image_refs
                            if asset_ref in catalog.images
                        ][:2]
                    if not linked_tables and page_numbers:
                        linked_tables = [
                            table for table in catalog.tables.values() if table.page_no in page_numbers
                        ][:2]
                    if not linked_images and page_numbers:
                        linked_images = [
                            LinkedImage(
                                image=image,
                                match_source="page_fallback",
                                context_excerpt=context_excerpt,
                                source_chunk_index=chunk.chunk_index,
                            )
                            for image in catalog.images.values()
                            if image.page_no in page_numbers
                        ][:2]

            enriched.append(
                EnrichedChunk(
                    chunk=chunk,
                    markdown_path=markdown_path,
                    page_numbers=page_numbers,
                    tables=linked_tables,
                    images=linked_images,
                )
            )

        return enriched

    def should_use_vision(self, query: str, enriched_chunks: List[EnrichedChunk]) -> bool:
        if self.vision_mode == "off":
            return False
        has_images = any(chunk.images for chunk in enriched_chunks)
        if not has_images:
            return False
        if self.vision_mode == "always":
            return True
        return question_needs_vision(query)

    def _score_linked_image(self, query: str, chunk: RetrievedChunk, linked_image: LinkedImage) -> float:
        query_terms = extract_query_terms(query)
        query_phrases = extract_query_phrases(query_terms)
        caption = linked_image.image.caption.lower()
        context = linked_image.context_excerpt.lower()
        haystack = "\n".join(part for part in [caption, context] if part)
        term_hits = sum(1 for term in set(query_terms) if term in haystack)
        phrase_hits = sum(1 for phrase in set(query_phrases) if phrase in haystack)

        match_boost = {
            "user_selection": 0.75,
            "direct_chunk": 0.45,
            "nearby_chunk": 0.2,
            "page_fallback": 0.05,
        }.get(linked_image.match_source, 0.0)

        score = chunk.similarity + match_boost
        score += 0.05 * term_hits
        score += 0.15 * phrase_hits
        if linked_image.image.caption:
            score += 0.08
        if any(
            token in haystack
            for token in (
                "figure",
                "diagram",
                "architecture",
                "pipeline",
                "workflow",
                "chart",
                "graph",
                "example",
                "overview",
                "schema",
            )
        ):
            score += 0.15
        if linked_image.match_source == "page_fallback" and not linked_image.image.caption:
            score -= 0.08
        return score

    def collect_images_for_vision(self, query: str, enriched_chunks: List[EnrichedChunk]) -> List[LinkedImage]:
        best_by_ref: Dict[str, LinkedImage] = {}
        for item in enriched_chunks:
            for linked_image in item.images:
                linked_image.relevance_score = self._score_linked_image(query, item.chunk, linked_image)
                asset_ref = linked_image.image.asset_ref
                existing = best_by_ref.get(asset_ref)
                if existing is None or linked_image.relevance_score > existing.relevance_score:
                    best_by_ref[asset_ref] = linked_image

        ranked_images = sorted(
            best_by_ref.values(),
            key=lambda image: (
                image.relevance_score,
                image.match_source == "direct_chunk",
                bool(image.image.caption),
            ),
            reverse=True,
        )
        return ranked_images[: self.max_vision_images]

    def analyze_images(self, query: str, images: List[LinkedImage]) -> Dict[str, Dict[str, str]]:
        if not images:
            return {}
        if self.vision_provider == "ollama":
            return self._analyze_images_ollama(query, images)
        if self.vision_provider != "groq":
            logger.warning("Vision provider %s is not supported for image analysis", self.vision_provider)
            return {}
        return self._analyze_images_groq(query, images)

    def build_selected_image_link(
        self,
        selected_image_data: Optional[str],
        selected_page: Optional[int],
    ) -> Optional[LinkedImage]:
        if not selected_image_data:
            return None

        try:
            image_bytes = decode_data_url_image(selected_image_data)
            image_hash = hashlib.sha256(image_bytes).hexdigest()
            output_path = self.selection_cache_dir / f"selection-p{selected_page or 'unknown'}-{image_hash[:16]}.png"

            if not output_path.exists():
                with Image.open(BytesIO(image_bytes)) as selection_image:
                    selection_image.convert("RGB").save(output_path, "PNG")

            return LinkedImage(
                image=ImageAsset(
                    asset_ref=f"user-selection:{image_hash[:16]}",
                    page_no=selected_page,
                    file_path=output_path,
                    caption="User-selected visual region",
                ),
                match_source="user_selection",
                context_excerpt="User-selected image region from the Study Desk PDF viewer.",
                source_chunk_index=None,
                relevance_score=1.5,
            )
        except Exception as exc:
            logger.warning("Failed to persist selected image region: %s", exc)
            return None

    def _analyze_images_groq(self, query: str, images: List[LinkedImage]) -> Dict[str, Dict[str, str]]:
        if self.groq_client is None:
            return {}

        content_parts: List[Dict[str, Any]] = []
        registry_lines = [
            "You are analyzing document figures for retrieval-augmented QA.",
            f"User question: {query}",
            "Return a JSON object with an 'images' array.",
            "Each item must include: image_index, asset_ref, summary, ocr_text, relevance.",
            "Prefer images directly linked to the retrieved chunk over nearby page-level images.",
            "Use exact OCR text when it is visible. Keep summaries concise.",
            "",
            "Image registry:",
        ]

        for index, linked_image in enumerate(images, start=1):
            image = linked_image.image
            registry_lines.append(
                f"{index}. asset_ref={image.asset_ref}, page={image.page_no or 'unknown'}, "
                f"match_source={linked_image.match_source}, score={linked_image.relevance_score:.3f}, "
                f"caption={image.caption or 'none'}"
            )
            if linked_image.context_excerpt:
                registry_lines.append(
                    f"   related_chunk_excerpt={truncate_text(linked_image.context_excerpt, 320)}"
                )

        content_parts.append({"type": "text", "text": "\n".join(registry_lines)})
        for linked_image in images:
            content_parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": self.encode_image_for_groq(linked_image.image.file_path)},
                }
            )

        try:
            response = self.groq_client.chat.completions.create(
                model=self.vision_model,
                messages=[{"role": "user", "content": content_parts}],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_completion_tokens=800,
            )
            content = response.choices[0].message.content or "{}"
            parsed = json.loads(content)
        except Exception as exc:
            logger.warning("Vision analysis failed: %s", exc)
            return {}

        images_payload = parsed.get("images", [])
        if not isinstance(images_payload, list):
            return {}

        notes_by_ref: Dict[str, Dict[str, str]] = {}
        for item in images_payload:
            if not isinstance(item, dict):
                continue
            asset_ref = item.get("asset_ref")
            if not asset_ref:
                continue
            notes_by_ref[asset_ref] = {
                "summary": str(item.get("summary", "")).strip(),
                "ocr_text": str(item.get("ocr_text", "")).strip(),
                "relevance": str(item.get("relevance", "")).strip(),
            }
        return notes_by_ref

    def _parse_single_vision_note(self, content: str, fallback_asset_ref: str) -> Optional[Dict[str, str]]:
        json_block = extract_json_block(content)
        if not json_block:
            return None

        try:
            parsed = json.loads(json_block)
        except json.JSONDecodeError:
            return None

        if isinstance(parsed, list):
            parsed = parsed[0] if parsed else {}
        elif isinstance(parsed, dict) and isinstance(parsed.get("images"), list):
            images = parsed.get("images") or []
            parsed = images[0] if images else {}

        if not isinstance(parsed, dict):
            return None

        asset_ref = str(parsed.get("asset_ref") or fallback_asset_ref).strip() or fallback_asset_ref
        return {
            "asset_ref": asset_ref,
            "summary": str(parsed.get("summary", "")).strip(),
            "ocr_text": str(parsed.get("ocr_text", "")).strip(),
            "relevance": str(parsed.get("relevance", "")).strip(),
        }

    def _analyze_images_ollama(self, query: str, images: List[LinkedImage]) -> Dict[str, Dict[str, str]]:
        if self.ollama_client is None:
            return {}

        notes_by_ref: Dict[str, Dict[str, str]] = {}
        for linked_image in images:
            image = linked_image.image
            prompt = "\n".join(
                [
                    "You are analyzing one document figure for retrieval-augmented QA.",
                    f"User question: {query}",
                    f"asset_ref: {image.asset_ref}",
                    f"page: {image.page_no or 'unknown'}",
                    f"match_source: {linked_image.match_source}",
                    f"caption: {image.caption or 'none'}",
                    f"related_chunk_excerpt: {truncate_text(linked_image.context_excerpt, 420) if linked_image.context_excerpt else 'none'}",
                    "",
                    "Return exactly one JSON object with keys:",
                    "asset_ref, summary, ocr_text, relevance",
                    "Use a short string for relevance such as yes, partial, or no.",
                    "Keep summary concise and copy visible text into ocr_text when possible.",
                ]
            )

            try:
                response = self.ollama_client.chat(
                    model=self.vision_model,
                    messages=[
                        {
                            "role": "user",
                            "content": prompt,
                            "images": [self.prepare_image_for_ollama(image.file_path)],
                        }
                    ],
                    options={
                        "temperature": 0,
                        "num_ctx": min(self.ollama_num_ctx, 4096),
                    },
                    think=False,
                )
                content = response.get("message", {}).get("content", "") if isinstance(response, dict) else getattr(getattr(response, "message", None), "content", "")
                note = self._parse_single_vision_note(content or "", image.asset_ref)
                if note is None:
                    logger.warning("Vision analysis failed: invalid JSON for %s", image.asset_ref)
                    continue
                notes_by_ref[note["asset_ref"]] = {
                    "summary": note["summary"],
                    "ocr_text": note["ocr_text"],
                    "relevance": note["relevance"],
                }
            except ResponseError as exc:
                logger.warning("Vision analysis failed for %s: %s", image.asset_ref, getattr(exc, "error", exc))
            except Exception as exc:
                logger.warning("Vision analysis failed for %s: %s", image.asset_ref, exc)

        return notes_by_ref

    def encode_image_for_groq(self, image_path: Path) -> str:
        with Image.open(image_path) as img:
            image = img.convert("RGB")
            max_pixels = 30_000_000
            total_pixels = image.width * image.height
            if total_pixels > max_pixels:
                scale = (max_pixels / total_pixels) ** 0.5
                image = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))))

            quality = 90
            while True:
                buffer = BytesIO()
                image.save(buffer, format="JPEG", quality=quality, optimize=True)
                payload = buffer.getvalue()
                if len(payload) <= 3_500_000 or quality <= 45:
                    break
                quality -= 15
                image = image.resize((max(1, int(image.width * 0.9)), max(1, int(image.height * 0.9))))

        encoded = base64.b64encode(payload).decode("utf-8")
        return f"data:image/jpeg;base64,{encoded}"

    def prepare_image_for_ollama(self, image_path: Path) -> bytes:
        with Image.open(image_path) as img:
            image = img.convert("RGB")
            max_pixels = 30_000_000
            total_pixels = image.width * image.height
            if total_pixels > max_pixels:
                scale = (max_pixels / total_pixels) ** 0.5
                image = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))))

            quality = 90
            while True:
                buffer = BytesIO()
                image.save(buffer, format="JPEG", quality=quality, optimize=True)
                payload = buffer.getvalue()
                if len(payload) <= 3_500_000 or quality <= 45:
                    break
                quality -= 15
                image = image.resize((max(1, int(image.width * 0.9)), max(1, int(image.height * 0.9))))

        return payload

    def build_context(
        self,
        query: str,
        enriched_chunks: List[EnrichedChunk],
        vision_notes: Dict[str, Dict[str, str]],
        selected_region_image: Optional[LinkedImage] = None,
        selected_region_note: Optional[Dict[str, str]] = None,
        selected_page: Optional[int] = None,
        selected_image_refs: Optional[Set[str]] = None,
    ) -> str:
        sections = [f"User question: {query}", "", "Retrieved knowledge context:"]

        if selected_page is not None:
            sections.extend([
                f"[User focus page: {selected_page}]",
                "Prioritize evidence from this page when the retrieved support matches it.",
                "",
            ])

        if selected_region_image is not None:
            image = selected_region_image.image
            region_lines = [
                f"[User-selected image region | page={image.page_no or 'unknown'} | asset_ref={image.asset_ref}]",
            ]
            if image.caption:
                region_lines.append(f"Caption: {image.caption}")
            if selected_region_note:
                if selected_region_note.get("summary"):
                    region_lines.append(f"Summary: {selected_region_note['summary']}")
                if selected_region_note.get("ocr_text"):
                    region_lines.append(f"OCR: {selected_region_note['ocr_text']}")
                if selected_region_note.get("relevance"):
                    region_lines.append(f"Relevance: {selected_region_note['relevance']}")
            else:
                region_lines.append("Vision analysis: selected by the user, but no structured image summary was returned.")
            sections.extend(region_lines + [""])

        for item in enriched_chunks:
            chunk = item.chunk
            pages = ", ".join(map(str, item.page_numbers)) if item.page_numbers else "unknown"
            modality = chunk_modality(chunk.chunk_metadata) or "text"
            sections.append(
                f"[Source: {chunk.document_title} | chunk={chunk.chunk_index} | similarity={chunk.similarity:.3f} | pages={pages} | modality={modality}]"
            )
            sections.append(chunk.content.strip())

            if item.markdown_path is not None:
                sections.append(f"Rich markdown cache: {item.markdown_path}")

            for table in item.tables:
                sections.append(
                    f"[Linked table {table.asset_ref} | page={table.page_no or 'unknown'}]\n{truncate_text(table.markdown, 2500)}"
                )

            for linked_image in item.images:
                image = linked_image.image
                note = vision_notes.get(image.asset_ref)
                image_lines = [
                    (
                        f"[Linked image {image.asset_ref} | page={image.page_no or 'unknown'} | "
                        f"match={linked_image.match_source} | score={linked_image.relevance_score:.3f}]"
                    )
                ]
                if image.caption:
                    image_lines.append(f"Caption: {image.caption}")
                if selected_image_refs and image.asset_ref in selected_image_refs and not note:
                    image_lines.append("Vision analysis: requested but no structured summary was returned.")
                if note:
                    if note.get("summary"):
                        image_lines.append(f"Summary: {note['summary']}")
                    if note.get("ocr_text"):
                        image_lines.append(f"OCR: {note['ocr_text']}")
                    if note.get("relevance"):
                        image_lines.append(f"Relevance: {note['relevance']}")
                sections.append("\n".join(image_lines))

            sections.append("")

        return "\n".join(sections).strip()

    def generate_answer(self, system_prompt: str, context: str) -> str:
        user_prompt = (
            "Answer the following question using only the retrieved context.\n\n"
            f"{context}\n\n"
            "Give a direct answer first, then concise source citations. "
            "If support is partial or missing, explicitly say so instead of filling gaps."
        )
        return self.text_client.generate_text(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=0.1,
            max_tokens=1200,
        )

    def append_response_markdown(
        self,
        query: str,
        answer: str,
        enriched_chunks: List[EnrichedChunk],
        used_vision: bool,
    ) -> None:
        timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
        unique_sources = dedupe_preserve_order([item.chunk.document_title for item in enriched_chunks])
        linked_tables = sum(len(item.tables) for item in enriched_chunks)
        linked_images = sum(len(item.images) for item in enriched_chunks)

        if not self.responses_md_path.exists():
            self.responses_md_path.write_text("# Vision Responses\n\n", encoding="utf-8")

        if not self.responses_session_logged:
            header = (
                f"### Session {self.session_started_at.isoformat(timespec='seconds')}\n\n"
                f"- Text provider: {self.text_provider}\n"
                f"- Text model: {self.text_model}\n"
                f"- Vision provider: {self.vision_provider}\n"
                f"- Vision model: {self.vision_model}\n"
                f"- Formula enrichment: {settings.DOCLING_FORMULA_ENRICHMENT}\n\n"
            )
            with self.responses_md_path.open("a", encoding="utf-8") as handle:
                handle.write(header)
            self.responses_session_logged = True

        chunk_lines = []
        for item in enriched_chunks:
            pages = ", ".join(map(str, item.page_numbers)) if item.page_numbers else "unknown"
            modality = chunk_modality(item.chunk.chunk_metadata) or "text"
            chunk_lines.append(
                f"- {item.chunk.document_title} | chunk={item.chunk.chunk_index} | "
                f"similarity={item.chunk.similarity:.3f} | pages={pages} | modality={modality}"
            )

        context_block = (
            f"- Timestamp: {timestamp}\n"
            f"- Text provider: {self.text_provider}\n"
            f"- Text model: {self.text_model}\n"
            f"- Vision provider: {self.vision_provider}\n"
            f"- Vision model: {self.vision_model}\n"
            f"- Vision used: {used_vision}\n"
            f"- Sources: {', '.join(unique_sources) if unique_sources else 'none'}\n"
            f"- Linked tables: {linked_tables}\n"
            f"- Linked images: {linked_images}\n"
        )
        if chunk_lines:
            context_block += "- Retrieved chunks:\n" + "\n".join(chunk_lines) + "\n"

        entry = (
            f"## Query {self.query_count + 1}\n\n"
            f"Q: {query}\n\n"
            f"A:\n{answer}\n\n"
            f"Context:\n{context_block}\n"
        )

        with self.responses_md_path.open("a", encoding="utf-8") as handle:
            handle.write(entry)

    def _serialize_sources(self, enriched_chunks: List[EnrichedChunk]) -> List[Dict[str, Any]]:
        sources: List[Dict[str, Any]] = []
        for item in enriched_chunks:
            chunk = item.chunk
            metadata = {
                **chunk.chunk_metadata,
                "document_id": chunk.document_id,
                "document_title": chunk.document_title,
                "document_source": chunk.document_source,
                "chunk_index": chunk.chunk_index,
                "page_numbers": item.page_numbers,
            }
            sources.append(
                {
                    "text": chunk.content,
                    "metadata": metadata,
                    "similarity": chunk.similarity,
                    "distance": 1 - chunk.similarity,
                }
            )
        return sources

    def answer_question(
        self,
        query: str,
        document_id: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 5,
        selected_page: Optional[int] = None,
        selected_image_data: Optional[str] = None,
    ) -> Dict[str, Any]:
        selected_region_image = self.build_selected_image_link(selected_image_data, selected_page)
        chunks = self.retrieve_chunks(
            query,
            document_id=document_id,
            user_id=user_id,
            limit=limit,
            preferred_page=selected_page,
        )
        if not chunks and selected_region_image is None:
            self.query_count += 1
            answer = "No relevant information was found in the knowledge base for that question."
            self.append_response_markdown(query, answer, [], False)
            return {
                "success": False,
                "answer": answer,
                "sources": [],
                "vision_used": False,
                "mode": "vision",
            }

        enriched_chunks = self.enrich_chunks(chunks) if chunks else []
        selected_images = self.collect_images_for_vision(query, enriched_chunks)
        use_vision = self.should_use_vision(query, enriched_chunks) and bool(selected_images)
        vision_notes: Dict[str, Dict[str, str]] = {}
        selected_region_note: Optional[Dict[str, str]] = None

        if selected_region_image is not None:
            selected_region_notes = self.analyze_images(query, [selected_region_image])
            selected_region_note = selected_region_notes.get(selected_region_image.image.asset_ref)
            use_vision = True

        if use_vision:
            vision_notes = self.analyze_images(query, selected_images)

        context = self.build_context(
            query,
            enriched_chunks,
            vision_notes,
            selected_region_image=selected_region_image,
            selected_region_note=selected_region_note,
            selected_page=selected_page,
            selected_image_refs={image.image.asset_ref for image in selected_images},
        )
        system_prompt = (
            "You answer questions using only retrieved documentation from a private knowledge base. "
            "Never answer from general knowledge or outside assumptions. "
            "Prefer retrieved chunk text and linked table markdown. "
            "Use linked image analysis and any user-selected image region only when they directly support the answer. "
            "If the retrieved context does not directly answer the question, say exactly: "
            "'The retrieved document does not directly answer this question.' "
            "Then briefly mention the closest relevant evidence, if any. "
            "Do not cite a source unless it directly supports the claim being made. "
            "Include page numbers in citations when available using the format [Document Title p.X]."
        )

        answer = self.generate_answer(system_prompt, context).strip()
        self.append_response_markdown(query, answer, enriched_chunks, use_vision)
        self.query_count += 1

        return {
            "success": True,
            "answer": answer,
            "sources": self._serialize_sources(enriched_chunks),
            "vision_used": use_vision,
            "mode": "vision",
            "context_used": truncate_text(context, 2000),
            "responses_md_path": str(self.responses_md_path),
        }


vision_service = VisionService()
