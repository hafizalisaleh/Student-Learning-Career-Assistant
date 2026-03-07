"""
Unified text-generation client for Docling RAG.
Supports Gemini, Groq, and Ollama for text and JSON generation.
"""

import json
from typing import Any, Optional

from config.settings import settings
from utils.logger import logger
from utils.providers import (
    get_ollama_host,
    get_ollama_num_ctx,
    get_text_model,
    get_text_provider,
)

try:
    from groq import Groq
except ImportError:  # pragma: no cover - optional dependency in some environments
    Groq = None  # type: ignore

try:
    from ollama import Client as OllamaClient
except ImportError:  # pragma: no cover - optional dependency in some environments
    OllamaClient = None  # type: ignore

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:  # pragma: no cover - optional dependency in some environments
    genai = None  # type: ignore
    genai_types = None  # type: ignore


def _extract_ollama_content(response: Any) -> str:
    if response is None:
        return ""
    message = getattr(response, "message", None)
    if message is not None:
        return getattr(message, "content", "") or ""
    if isinstance(response, dict):
        message = response.get("message", {})
        if isinstance(message, dict):
            return message.get("content", "") or ""
    return ""


class RAGLLMClient:
    """Provider-aware LLM client for RAG answer synthesis and verification."""

    def __init__(self, provider: Optional[str] = None, model: Optional[str] = None):
        self.provider = get_text_provider(provider)
        self.model = model or get_text_model(self.provider)
        self._groq_client = None
        self._ollama_client = None
        self._gemini_client = None

    def _ensure_client(self) -> None:
        if self.provider == "groq":
            if self._groq_client is None:
                if Groq is None:
                    raise RuntimeError("groq package is not installed")
                if not settings.GROQ_API_KEY:
                    raise RuntimeError("GROQ_API_KEY is not configured")
                self._groq_client = Groq(api_key=settings.GROQ_API_KEY)
        elif self.provider == "ollama":
            if self._ollama_client is None:
                if OllamaClient is None:
                    raise RuntimeError("ollama package is not installed")
                self._ollama_client = OllamaClient(host=get_ollama_host())
        else:
            if self._gemini_client is None:
                if genai is None or genai_types is None:
                    raise RuntimeError("google-genai package is not installed")
                api_key = getattr(settings, "GOOGLE_API_KEY", "") or getattr(settings, "GEMINI_API_KEY", "")
                if not api_key:
                    raise RuntimeError("GOOGLE_API_KEY is not configured")
                self._gemini_client = genai.Client(api_key=api_key)

    def generate_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 1200,
    ) -> str:
        self._ensure_client()

        if self.provider == "groq":
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            response = self._groq_client.chat.completions.create(  # type: ignore[union-attr]
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_completion_tokens=max_tokens,
            )
            return (response.choices[0].message.content or "").strip()

        if self.provider == "ollama":
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            response = self._ollama_client.chat(  # type: ignore[union-attr]
                model=self.model,
                messages=messages,
                options={
                    "temperature": temperature,
                    "num_ctx": get_ollama_num_ctx(),
                    "num_predict": max_tokens,
                },
                think=False,
            )
            return _extract_ollama_content(response).strip()

        combined_prompt = prompt if not system_prompt else f"{system_prompt}\n\n{prompt}"
        response = self._gemini_client.models.generate_content(  # type: ignore[union-attr]
            model=self.model,
            contents=combined_prompt,
            config=genai_types.GenerateContentConfig(temperature=temperature),
        )
        return (response.text or "").strip()

    def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 1200,
        schema: Optional[dict] = None,
    ) -> str:
        self._ensure_client()

        if self.provider == "groq":
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt if "JSON" in prompt.upper() else f"{prompt}\n\nReturn only valid JSON."})
            response = self._groq_client.chat.completions.create(  # type: ignore[union-attr]
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_completion_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
            return (response.choices[0].message.content or "").strip()

        if self.provider == "ollama":
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            json_prompt = prompt if "JSON" in prompt.upper() else f"{prompt}\n\nReturn only valid JSON matching the requested structure."
            messages.append({"role": "user", "content": json_prompt})
            response = self._ollama_client.chat(  # type: ignore[union-attr]
                model=self.model,
                messages=messages,
                options={
                    "temperature": temperature,
                    "num_ctx": get_ollama_num_ctx(),
                    "num_predict": max_tokens,
                },
                think=False,
            )
            return _extract_ollama_content(response).strip()

        combined_prompt = prompt if not system_prompt else f"{system_prompt}\n\n{prompt}"
        config_kwargs = {
            "temperature": temperature,
            "response_mime_type": "application/json",
        }
        if schema:
            config_kwargs["response_json_schema"] = schema
        response = self._gemini_client.models.generate_content(  # type: ignore[union-attr]
            model=self.model,
            contents=combined_prompt,
            config=genai_types.GenerateContentConfig(**config_kwargs),
        )
        return (response.text or "").strip()


def safe_load_json(raw_text: str) -> Any:
    """Best-effort JSON loader that strips fenced code blocks first."""
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned.replace("```json", "", 1).rsplit("```", 1)[0].strip()
    elif cleaned.startswith("```"):
        cleaned = cleaned.replace("```", "", 1).rsplit("```", 1)[0].strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Failed to parse provider JSON response")
        raise
