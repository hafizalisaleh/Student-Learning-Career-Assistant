"""
Document embedding generation using local Hugging Face models.
Replaces Gemini API embeddings with local inference (BAAI/bge-small-en-v1.5, 384d).
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import torch
from transformers import AutoModel, AutoTokenizer

from .chunker import DocumentChunk
from utils.providers import (
    get_embedding_device,
    get_embedding_dimension,
    get_embedding_model,
    get_embedding_query_instruction,
)

logger = logging.getLogger(__name__)


# Model configurations for known embedding models
EMBEDDING_MODEL_CONFIGS = {
    "BAAI/bge-small-en-v1.5": {
        "dimensions": 384,
        "max_tokens": 512,
        "pooling": "cls",
        "query_instruction": "Represent this sentence for searching relevant passages: ",
    },
    "sentence-transformers/all-MiniLM-L6-v2": {
        "dimensions": 384,
        "max_tokens": 256,
        "pooling": "mean",
        "query_instruction": "",
    },
}


def get_embedding_config(model_name: str) -> Dict[str, Any]:
    """Get config for a known model or return defaults."""
    return EMBEDDING_MODEL_CONFIGS.get(
        model_name,
        {
            "dimensions": get_embedding_dimension(model_name),
            "max_tokens": 512,
            "pooling": "cls",
            "query_instruction": get_embedding_query_instruction(model_name),
        },
    )


class EmbeddingGenerator:
    """Generates embeddings for document chunks using a local Hugging Face model."""

    _model_cache: Dict[Tuple[str, str], Tuple[Any, Any, int]] = {}

    def __init__(
        self,
        model: str = get_embedding_model(),
        batch_size: int = 32,
        device: str = get_embedding_device(),
    ):
        self.model_name = model
        self.batch_size = batch_size
        self.device = self._resolve_device(device)
        self.config = get_embedding_config(model)
        self.query_instruction = get_embedding_query_instruction(model) or self.config.get("query_instruction", "")

    def _resolve_device(self, device: str) -> str:
        if device != "auto":
            return device
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _get_model_components(self) -> Tuple[Any, Any, int]:
        cache_key = (self.model_name, self.device)
        if cache_key not in self._model_cache:
            logger.info(f"Loading embedding model {self.model_name} on {self.device}")
            tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            model = AutoModel.from_pretrained(self.model_name)
            model.to(self.device)
            model.eval()
            hidden_size = getattr(model.config, "hidden_size", self.config["dimensions"])
            self._model_cache[cache_key] = (tokenizer, model, hidden_size)

        tokenizer, model, hidden_size = self._model_cache[cache_key]
        self.config["dimensions"] = hidden_size
        return tokenizer, model, hidden_size

    def _prepare_text(self, text: str, is_query: bool = False) -> str:
        normalized_text = text.strip()
        if not normalized_text:
            return ""
        if is_query and self.query_instruction and not normalized_text.startswith(self.query_instruction):
            return f"{self.query_instruction}{normalized_text}"
        return normalized_text

    def _mean_pooling(self, token_embeddings: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        summed = torch.sum(token_embeddings * input_mask_expanded, dim=1)
        counts = torch.clamp(input_mask_expanded.sum(dim=1), min=1e-9)
        return summed / counts

    def _zero_embedding(self, dimension: int) -> List[float]:
        return [0.0] * dimension

    def _encode_sync(self, texts: List[str], is_query: bool = False) -> List[List[float]]:
        tokenizer, model, hidden_size = self._get_model_components()
        embeddings: List[List[float]] = [self._zero_embedding(hidden_size) for _ in texts]

        prepared_texts = []
        prepared_indices = []
        for index, text in enumerate(texts):
            prepared_text = self._prepare_text(text, is_query=is_query)
            if prepared_text:
                prepared_texts.append(prepared_text)
                prepared_indices.append(index)

        if not prepared_texts:
            return embeddings

        encoded_inputs = tokenizer(
            prepared_texts,
            padding=True,
            truncation=True,
            max_length=self.config["max_tokens"],
            return_tensors="pt",
        )
        encoded_inputs = {key: value.to(self.device) for key, value in encoded_inputs.items()}

        with torch.inference_mode():
            model_output = model(**encoded_inputs)
            if self.config["pooling"] == "mean":
                pooled = self._mean_pooling(model_output.last_hidden_state, encoded_inputs["attention_mask"])
            else:
                pooled = model_output.last_hidden_state[:, 0]
            normalized = torch.nn.functional.normalize(pooled, p=2, dim=1)

        encoded_embeddings = normalized.cpu().tolist()
        for index, embedding in zip(prepared_indices, encoded_embeddings):
            embeddings[index] = embedding

        return embeddings

    def generate_embedding(self, text: str) -> List[float]:
        """Generate an embedding for a single text (synchronous)."""
        return self._encode_sync([text])[0]

    def generate_query_embedding(self, text: str) -> List[float]:
        """Generate an embedding for a search query (synchronous, with query prefix)."""
        return self._encode_sync([text], is_query=True)[0]

    def generate_embeddings_batch(self, texts: List[str], is_query: bool = False) -> List[List[float]]:
        """Generate embeddings for a batch of texts (synchronous)."""
        return self._encode_sync(texts, is_query)

    def embed_chunks(self, chunks: List[DocumentChunk]) -> List[DocumentChunk]:
        """Generate embeddings for document chunks (synchronous)."""
        if not chunks:
            return chunks

        logger.info(f"Generating embeddings for {len(chunks)} chunks")
        embedded_chunks = []

        for i in range(0, len(chunks), self.batch_size):
            batch_chunks = chunks[i:i + self.batch_size]
            batch_texts = [chunk.content for chunk in batch_chunks]

            try:
                embeddings = self._encode_sync(batch_texts)

                for chunk, embedding in zip(batch_chunks, embeddings):
                    embedded_chunk = DocumentChunk(
                        content=chunk.content,
                        index=chunk.index,
                        start_char=chunk.start_char,
                        end_char=chunk.end_char,
                        metadata={
                            **chunk.metadata,
                            "embedding_model": self.model_name,
                            "embedding_generated_at": datetime.now().isoformat(),
                        },
                        token_count=chunk.token_count,
                    )
                    embedded_chunk.embedding = embedding
                    embedded_chunks.append(embedded_chunk)

                current_batch = (i // self.batch_size) + 1
                total_batches = (len(chunks) + self.batch_size - 1) // self.batch_size
                logger.info(f"Processed batch {current_batch}/{total_batches}")

            except Exception as e:
                logger.error(f"Failed to process batch {i // self.batch_size + 1}: {e}")
                for chunk in batch_chunks:
                    chunk.embedding = self._zero_embedding(self.config["dimensions"])
                    embedded_chunks.append(chunk)

        logger.info(f"Generated embeddings for {len(embedded_chunks)} chunks")
        return embedded_chunks

    def get_embedding_dimension(self) -> int:
        return self.config["dimensions"]


# Singleton cache
_embedder_instance: Optional[EmbeddingGenerator] = None


def get_embedder(
    model: str = get_embedding_model(),
    device: str = get_embedding_device(),
) -> EmbeddingGenerator:
    """Get or create the global embedder instance."""
    global _embedder_instance
    if _embedder_instance is None:
        _embedder_instance = EmbeddingGenerator(model=model, device=device)
    return _embedder_instance
