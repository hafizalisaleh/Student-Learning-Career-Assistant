"""
Provider and model configuration adapted from docling-rag-agent.
Centralizes runtime choices for text generation, vision generation,
local embeddings, and Ollama connectivity.
"""

import os
from typing import Optional

from config.settings import settings

DEFAULT_TEXT_PROVIDER = "gemini"
DEFAULT_VISION_PROVIDER = "groq"
DEFAULT_TEXT_MODEL = "llama-3.3-70b-versatile"
DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
DEFAULT_OLLAMA_HOST = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "qwen3.5:0.8b"
DEFAULT_RESPONSES_MD = "runtime/vision_responses.md"
DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
DEFAULT_EMBEDDING_DIMENSION = 384
DEFAULT_BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "

EMBEDDING_MODEL_CONFIGS = {
    "BAAI/bge-small-en-v1.5": {
        "dimensions": 384,
        "query_instruction": DEFAULT_BGE_QUERY_INSTRUCTION,
    },
    "sentence-transformers/all-MiniLM-L6-v2": {
        "dimensions": 384,
        "query_instruction": "",
    },
}


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    return os.getenv(name, default)


def get_text_provider(provider_name: Optional[str] = None) -> str:
    configured = provider_name or _env("RAG_LLM_PROVIDER") or _env("LLM_PROVIDER") or settings.RAG_LLM_PROVIDER or DEFAULT_TEXT_PROVIDER
    return configured.lower()


def get_vision_provider(provider_name: Optional[str] = None) -> str:
    configured = provider_name or _env("RAG_VISION_PROVIDER") or _env("VISION_PROVIDER") or settings.RAG_VISION_PROVIDER or DEFAULT_VISION_PROVIDER
    return configured.lower()


def get_text_model(provider_name: Optional[str] = None) -> str:
    provider = get_text_provider(provider_name)
    if provider == "ollama":
        return _env("OLLAMA_MODEL", settings.OLLAMA_MODEL or DEFAULT_OLLAMA_MODEL)
    if provider == "groq":
        return _env("GROQ_MODEL") or _env("LLM_CHOICE") or settings.GROQ_MODEL or DEFAULT_TEXT_MODEL
    return _env("GEMINI_MODEL", settings.GEMINI_MODEL)


def get_vision_model(provider_name: Optional[str] = None) -> str:
    provider = get_vision_provider(provider_name)
    if provider == "ollama":
        return _env("OLLAMA_VISION_MODEL", settings.OLLAMA_VISION_MODEL or settings.OLLAMA_MODEL or DEFAULT_OLLAMA_MODEL)
    if provider == "groq":
        return _env("GROQ_VISION_MODEL", settings.GROQ_VISION_MODEL or DEFAULT_VISION_MODEL)
    return _env("GEMINI_MODEL", settings.GEMINI_MODEL)


def get_vision_mode() -> str:
    return (_env("RAG_VISION_MODE", settings.RAG_VISION_MODE or "auto") or "auto").lower()


def get_vision_responses_md() -> str:
    return _env("VISION_RESPONSES_MD", settings.VISION_RESPONSES_MD or DEFAULT_RESPONSES_MD) or DEFAULT_RESPONSES_MD


def get_ollama_host() -> str:
    return _env("OLLAMA_HOST", settings.OLLAMA_HOST or DEFAULT_OLLAMA_HOST) or DEFAULT_OLLAMA_HOST


def get_ollama_num_ctx() -> int:
    return int(_env("OLLAMA_NUM_CTX", str(settings.OLLAMA_NUM_CTX or 16384)) or "16384")


def get_embedding_model(model_name: Optional[str] = None) -> str:
    return model_name or _env("EMBEDDING_MODEL", settings.EMBEDDING_MODEL or DEFAULT_EMBEDDING_MODEL) or DEFAULT_EMBEDDING_MODEL


def get_embedding_dimension(model_name: Optional[str] = None) -> int:
    configured_model = get_embedding_model(model_name)
    configured_dimension = EMBEDDING_MODEL_CONFIGS.get(configured_model, {}).get("dimensions")
    if configured_dimension is not None:
        return configured_dimension
    return int(_env("EMBEDDING_DIMENSION", str(settings.EMBEDDING_DIMENSION or DEFAULT_EMBEDDING_DIMENSION)) or str(DEFAULT_EMBEDDING_DIMENSION))


def get_embedding_query_instruction(model_name: Optional[str] = None) -> str:
    if "EMBED_QUERY_INSTRUCTION" in os.environ:
        return _env("EMBED_QUERY_INSTRUCTION", "") or ""
    configured_model = get_embedding_model(model_name)
    return EMBEDDING_MODEL_CONFIGS.get(configured_model, {}).get("query_instruction", "")


def get_embedding_device() -> str:
    return _env("EMBEDDING_DEVICE", settings.EMBEDDING_DEVICE or "auto") or "auto"
