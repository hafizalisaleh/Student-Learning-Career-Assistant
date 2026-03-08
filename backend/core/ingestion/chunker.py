"""
Docling HybridChunker implementation for intelligent document splitting.

Uses Docling's built-in HybridChunker which combines:
- Token-aware chunking (uses actual tokenizer)
- Document structure preservation (headings, sections, tables)
- Semantic boundary respect (paragraphs, code blocks)
- Contextualized output (chunks include heading hierarchy)
"""

import logging
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass

from transformers import AutoTokenizer
from docling.chunking import HybridChunker
from docling_core.types.doc import DoclingDocument

logger = logging.getLogger(__name__)

DEFAULT_HYBRID_TOKENIZER = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_HYBRID_MAX_TOKENS = 256
DEFAULT_HYBRID_MERGE_PEERS = False


def dedupe_preserve_order(values: List[str]) -> List[str]:
    seen: Set[str] = set()
    deduped: List[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            deduped.append(value)
    return deduped


def extract_page_numbers(doc_item: Any) -> List[int]:
    page_numbers: List[int] = []
    for prov in getattr(doc_item, "prov", []) or []:
        page_no = getattr(prov, "page_no", None)
        if page_no is not None:
            page_numbers.append(page_no)
    return sorted(set(page_numbers))


def build_order_entries(docling_doc: DoclingDocument) -> List[Dict[str, Any]]:
    order_entries: List[Dict[str, Any]] = []
    for order_index, (element, _level) in enumerate(docling_doc.iterate_items()):
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
            }
        )
    return order_entries


def find_nearby_asset_refs(
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


@dataclass
class ChunkingConfig:
    """Configuration for chunking."""
    chunk_size: int = 1000
    chunk_overlap: int = 200
    max_chunk_size: int = 2000
    min_chunk_size: int = 100
    use_semantic_splitting: bool = True
    preserve_structure: bool = True
    max_tokens: int = DEFAULT_HYBRID_MAX_TOKENS
    merge_peers: bool = DEFAULT_HYBRID_MERGE_PEERS
    tokenizer_model: str = DEFAULT_HYBRID_TOKENIZER

    def __post_init__(self):
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("Chunk overlap must be less than chunk size")
        if self.min_chunk_size <= 0:
            raise ValueError("Minimum chunk size must be positive")
        if self.max_tokens <= 0:
            raise ValueError("Maximum tokens must be positive")


@dataclass
class DocumentChunk:
    """Represents a document chunk with optional embedding."""
    content: str
    index: int
    start_char: int
    end_char: int
    metadata: Dict[str, Any]
    token_count: Optional[int] = None
    embedding: Optional[List[float]] = None

    def __post_init__(self):
        if self.token_count is None:
            self.token_count = len(self.content) // 4


class DoclingHybridChunker:
    """
    Docling HybridChunker wrapper for intelligent document splitting.

    Uses Docling's built-in HybridChunker which:
    - Respects document structure (sections, paragraphs, tables)
    - Is token-aware (fits embedding model limits)
    - Preserves semantic coherence
    - Includes heading context in chunks
    """

    def __init__(self, config: ChunkingConfig):
        self.config = config
        logger.info(f"Initializing tokenizer: {config.tokenizer_model}")
        self.tokenizer = AutoTokenizer.from_pretrained(
            config.tokenizer_model,
            local_files_only=True,
        )
        self.chunker = HybridChunker(
            tokenizer=self.tokenizer,
            max_tokens=config.max_tokens,
            merge_peers=config.merge_peers,
        )
        logger.info(
            "HybridChunker initialized (max_tokens=%s, merge_peers=%s)",
            config.max_tokens,
            config.merge_peers,
        )

    def chunk_document(
        self,
        content: str,
        title: str,
        source: str,
        metadata: Optional[Dict[str, Any]] = None,
        docling_doc: Optional[DoclingDocument] = None
    ) -> List[DocumentChunk]:
        """
        Chunk a document using Docling's HybridChunker.

        Args:
            content: Document content (markdown format)
            title: Document title
            source: Document source
            metadata: Additional metadata
            docling_doc: Optional pre-converted DoclingDocument

        Returns:
            List of document chunks with contextualized content
        """
        if not content.strip():
            return []

        base_metadata = {
            "title": title,
            "source": source,
            "chunk_method": "hybrid",
            **(metadata or {})
        }

        if docling_doc is None:
            logger.warning("No DoclingDocument provided, using simple chunking fallback")
            return self._simple_fallback_chunk(content, base_metadata)

        try:
            chunk_iter = self.chunker.chunk(dl_doc=docling_doc)
            chunks = list(chunk_iter)
            order_entries = build_order_entries(docling_doc)
            order_index = {entry["ref"]: entry["index"] for entry in order_entries}

            document_chunks = []
            current_pos = 0

            for i, chunk in enumerate(chunks):
                contextualized_text = self.chunker.contextualize(chunk=chunk)
                token_count = len(self.tokenizer.encode(contextualized_text))

                positions: List[int] = []
                page_numbers: Set[int] = set()
                direct_table_refs: List[str] = []
                direct_image_refs: List[str] = []
                for doc_item in chunk.meta.doc_items:
                    item_ref = getattr(doc_item, "self_ref", None)
                    if item_ref in order_index:
                        positions.append(order_index[item_ref])
                    label = getattr(getattr(doc_item, "label", None), "value", "")
                    if label == "table" and item_ref:
                        direct_table_refs.append(item_ref)
                    elif label == "picture" and item_ref:
                        direct_image_refs.append(item_ref)
                    page_numbers.update(extract_page_numbers(doc_item))

                table_refs = dedupe_preserve_order(direct_table_refs)
                if not table_refs:
                    table_refs.extend(
                        find_nearby_asset_refs(
                            order_entries, positions, page_numbers,
                            asset_label="table", max_results=1, window=4,
                        )
                    )

                image_refs = dedupe_preserve_order(direct_image_refs)
                if not image_refs:
                    image_refs.extend(
                        find_nearby_asset_refs(
                            order_entries, positions, page_numbers,
                            asset_label="picture", max_results=2, window=6,
                        )
                    )

                chunk_metadata = {
                    **base_metadata,
                    "total_chunks": len(chunks),
                    "token_count": token_count,
                    "has_context": True,
                    "page_numbers": sorted(page_numbers),
                    "direct_table_refs": dedupe_preserve_order(direct_table_refs),
                    "direct_image_refs": dedupe_preserve_order(direct_image_refs),
                    "table_refs": dedupe_preserve_order(table_refs),
                    "image_refs": dedupe_preserve_order(image_refs),
                }

                start_char = current_pos
                end_char = start_char + len(contextualized_text)

                document_chunks.append(DocumentChunk(
                    content=contextualized_text.strip(),
                    index=i,
                    start_char=start_char,
                    end_char=end_char,
                    metadata=chunk_metadata,
                    token_count=token_count
                ))

                current_pos = end_char

            logger.info(f"Created {len(document_chunks)} chunks using HybridChunker")
            return document_chunks

        except Exception as e:
            logger.error(f"HybridChunker failed: {e}, falling back to simple chunking")
            return self._simple_fallback_chunk(content, base_metadata)

    def _simple_fallback_chunk(
        self, content: str, base_metadata: Dict[str, Any]
    ) -> List[DocumentChunk]:
        """Simple fallback chunking when HybridChunker can't be used."""
        chunks = []
        chunk_size = self.config.chunk_size
        overlap = self.config.chunk_overlap
        start = 0
        chunk_index = 0

        while start < len(content):
            end = start + chunk_size
            if end >= len(content):
                chunk_text = content[start:]
            else:
                chunk_end = end
                for i in range(end, max(start + self.config.min_chunk_size, end - 200), -1):
                    if i < len(content) and content[i] in '.!?\n':
                        chunk_end = i + 1
                        break
                chunk_text = content[start:chunk_end]
                end = chunk_end

            if chunk_text.strip():
                token_count = len(self.tokenizer.encode(chunk_text))
                chunks.append(DocumentChunk(
                    content=chunk_text.strip(),
                    index=chunk_index,
                    start_char=start,
                    end_char=end,
                    metadata={
                        **base_metadata,
                        "chunk_method": "simple_fallback",
                        "total_chunks": -1
                    },
                    token_count=token_count
                ))
                chunk_index += 1

            start = end - overlap

        for chunk in chunks:
            chunk.metadata["total_chunks"] = len(chunks)

        logger.info(f"Created {len(chunks)} chunks using simple fallback")
        return chunks


def create_chunker(config: ChunkingConfig):
    """Create appropriate chunker based on configuration."""
    if config.use_semantic_splitting:
        return DoclingHybridChunker(config)
    else:
        return DoclingHybridChunker(config)  # Always use HybridChunker, fallback is built-in
