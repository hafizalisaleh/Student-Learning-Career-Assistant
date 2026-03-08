"""
Unified text-generation client for Docling RAG.
Supports Gemini, Groq, and Ollama for provider-native text, JSON, and tool use.
"""

import copy
import json
from typing import Any, Dict, List, Optional

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


_GROQ_JSON_SCHEMA_MODELS = {
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "moonshotai/kimi-k2-instruct-0905",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-safeguard-20b",
}

_GROQ_STRICT_JSON_SCHEMA_MODELS = {
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
}


def _coerce_provider_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            else:
                parts.append(str(item))
        return "\n".join(part for part in parts if part).strip()
    if isinstance(content, dict):
        return str(content.get("text") or content.get("content") or json.dumps(content, default=str))
    return str(content)


def _extract_ollama_content(response: Any) -> str:
    if response is None:
        return ""
    message = getattr(response, "message", None)
    if message is not None:
        return _coerce_provider_text(getattr(message, "content", "") or "")
    if isinstance(response, dict):
        message = response.get("message", {})
        if isinstance(message, dict):
            return _coerce_provider_text(message.get("content", "") or "")
    return ""


def _extract_ollama_message(response: Any) -> Dict[str, Any]:
    if isinstance(response, dict):
        message = response.get("message", {})
        if isinstance(message, dict):
            payload = {
                "role": message.get("role", "assistant"),
                "content": _coerce_provider_text(message.get("content", "")),
            }
            if message.get("tool_calls"):
                payload["tool_calls"] = message.get("tool_calls")
            return payload

    message = getattr(response, "message", None)
    if message is None:
        return {"role": "assistant", "content": ""}

    payload = {
        "role": getattr(message, "role", "assistant"),
        "content": _coerce_provider_text(getattr(message, "content", "")),
    }
    tool_calls = getattr(message, "tool_calls", None)
    if tool_calls:
        payload["tool_calls"] = tool_calls
    return payload


def _coerce_tool_arguments(raw_arguments: Any) -> Dict[str, Any]:
    if raw_arguments is None:
        return {}
    if isinstance(raw_arguments, dict):
        return raw_arguments
    if hasattr(raw_arguments, "to_dict"):
        try:
            return raw_arguments.to_dict()
        except Exception:
            pass
    if isinstance(raw_arguments, str):
        cleaned = raw_arguments.strip()
        if not cleaned:
            return {}
        try:
            parsed = json.loads(cleaned)
            return parsed if isinstance(parsed, dict) else {"value": parsed}
        except json.JSONDecodeError:
            return {"value": cleaned}
    return {"value": raw_arguments}


def _extract_ollama_tool_calls(response: Any) -> List[Dict[str, Any]]:
    if isinstance(response, dict):
        raw_calls = (response.get("message") or {}).get("tool_calls") or []
    else:
        message = getattr(response, "message", None)
        raw_calls = getattr(message, "tool_calls", None) or []

    extracted: List[Dict[str, Any]] = []
    for index, tool_call in enumerate(raw_calls):
        if isinstance(tool_call, dict):
            function = tool_call.get("function", {})
            extracted.append(
                {
                    "id": tool_call.get("id") or f"tool-{index}",
                    "name": function.get("name", ""),
                    "arguments": _coerce_tool_arguments(function.get("arguments")),
                }
            )
            continue

        function = getattr(tool_call, "function", None)
        extracted.append(
            {
                "id": getattr(tool_call, "id", None) or f"tool-{index}",
                "name": getattr(function, "name", "") if function is not None else "",
                "arguments": _coerce_tool_arguments(
                    getattr(function, "arguments", None) if function is not None else None
                ),
            }
        )

    return [tool for tool in extracted if tool.get("name")]


def _stringify_tool_result(result: Any) -> str:
    if result is None:
        return "null"
    if isinstance(result, str):
        return result
    try:
        return json.dumps(result, ensure_ascii=False, default=str)
    except TypeError:
        return str(result)


def _normalize_tool_spec(tool: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(tool, dict):
        raise TypeError("Tools must be dict schemas or OpenAI-style function definitions")

    function_payload = tool.get("function") if tool.get("type") == "function" else tool
    if not isinstance(function_payload, dict):
        raise ValueError("Invalid tool definition; expected a function schema")

    name = str(function_payload.get("name") or "").strip()
    if not name:
        raise ValueError("Tool definition is missing a function name")

    description = str(function_payload.get("description") or "").strip()
    parameters = function_payload.get("parameters") or {"type": "object", "properties": {}}
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": parameters,
        },
    }


def _schema_is_groq_strict_compatible(schema: Any) -> bool:
    if not isinstance(schema, dict):
        return False

    if "anyOf" in schema:
        variants = schema.get("anyOf")
        return isinstance(variants, list) and all(_schema_is_groq_strict_compatible(item) for item in variants)

    schema_type = schema.get("type")
    if schema_type == "object":
        properties = schema.get("properties")
        required = schema.get("required")
        if not isinstance(properties, dict) or not isinstance(required, list):
            return False
        if set(required) != set(properties.keys()):
            return False
        if schema.get("additionalProperties") is not False:
            return False
        return all(_schema_is_groq_strict_compatible(value) for value in properties.values())

    if schema_type == "array":
        return _schema_is_groq_strict_compatible(schema.get("items"))

    return True


def _extract_gemini_function_calls(response: Any) -> List[Dict[str, Any]]:
    raw_calls = getattr(response, "function_calls", None) or []
    extracted: List[Dict[str, Any]] = []

    for index, call in enumerate(raw_calls):
        name = getattr(call, "name", "") or (call.get("name") if isinstance(call, dict) else "")
        args = getattr(call, "args", None) if not isinstance(call, dict) else call.get("args")
        extracted.append(
            {
                "id": getattr(call, "id", None) or f"tool-{index}",
                "name": name,
                "arguments": _coerce_tool_arguments(args),
            }
        )

    if extracted:
        return [tool for tool in extracted if tool.get("name")]

    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return []

    content = getattr(candidates[0], "content", None)
    parts = getattr(content, "parts", None) or []
    for index, part in enumerate(parts):
        function_call = getattr(part, "function_call", None)
        if function_call is None:
            continue
        extracted.append(
            {
                "id": getattr(function_call, "id", None) or f"tool-{index}",
                "name": getattr(function_call, "name", ""),
                "arguments": _coerce_tool_arguments(getattr(function_call, "args", None)),
            }
        )
    return [tool for tool in extracted if tool.get("name")]


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

    def _build_messages(self, prompt: str, system_prompt: Optional[str] = None) -> List[Dict[str, str]]:
        messages: List[Dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        return messages

    def _groq_supports_json_schema(self) -> bool:
        return self.model in _GROQ_JSON_SCHEMA_MODELS

    def _groq_supports_strict_json_schema(self) -> bool:
        return self.model in _GROQ_STRICT_JSON_SCHEMA_MODELS

    def _prepare_groq_response_format(
        self,
        schema: Optional[dict],
        schema_name: str = "structured_response",
    ) -> Dict[str, Any]:
        if not schema:
            return {"type": "json_object"}

        if not self._groq_supports_json_schema():
            logger.info(
                "Groq model %s does not support json_schema structured outputs; falling back to json_object",
                self.model,
            )
            return {"type": "json_object"}

        strict = self._groq_supports_strict_json_schema() and _schema_is_groq_strict_compatible(schema)
        return {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "strict": strict,
                "schema": copy.deepcopy(schema),
            },
        }

    def _prepare_gemini_tools(self, tools: List[Dict[str, Any]]) -> List[Any]:
        declarations = []
        for tool in tools:
            function_schema = tool["function"]
            declarations.append(
                genai_types.FunctionDeclaration(
                    name=function_schema["name"],
                    description=function_schema.get("description", ""),
                    parameters=function_schema.get("parameters") or {"type": "object", "properties": {}},
                )
            )
        return [genai_types.Tool(function_declarations=declarations)]

    def _execute_tool(self, tool_executor: Any, name: str, arguments: Dict[str, Any]) -> Any:
        if callable(tool_executor):
            return tool_executor(name, arguments)

        handler = None
        if isinstance(tool_executor, dict):
            handler = tool_executor.get(name)
        else:
            handler = getattr(tool_executor, name, None)

        if not callable(handler):
            raise RuntimeError(f"No tool executor registered for '{name}'")

        try:
            return handler(**arguments)
        except TypeError:
            return handler(arguments)

    def generate_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 1200,
    ) -> str:
        self._ensure_client()

        if self.provider == "groq":
            response = self._groq_client.chat.completions.create(  # type: ignore[union-attr]
                model=self.model,
                messages=self._build_messages(prompt, system_prompt),
                temperature=temperature,
                max_completion_tokens=max_tokens,
            )
            return _coerce_provider_text(response.choices[0].message.content).strip()

        if self.provider == "ollama":
            response = self._ollama_client.chat(  # type: ignore[union-attr]
                model=self.model,
                messages=self._build_messages(prompt, system_prompt),
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
            response_format = self._prepare_groq_response_format(schema)
            json_prompt = prompt
            if response_format.get("type") == "json_object" and "JSON" not in prompt.upper():
                json_prompt = f"{prompt}\n\nReturn only valid JSON."
            response = self._groq_client.chat.completions.create(  # type: ignore[union-attr]
                model=self.model,
                messages=self._build_messages(json_prompt, system_prompt),
                temperature=temperature,
                max_completion_tokens=max_tokens,
                response_format=response_format,
            )
            return _coerce_provider_text(response.choices[0].message.content).strip()

        if self.provider == "ollama":
            json_prompt = prompt if "JSON" in prompt.upper() else f"{prompt}\n\nReturn only valid JSON matching the requested structure."
            response = self._ollama_client.chat(  # type: ignore[union-attr]
                model=self.model,
                messages=self._build_messages(json_prompt, system_prompt),
                format=schema if schema else "json",
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

    def generate_with_tools(
        self,
        prompt: str,
        tools: List[Dict[str, Any]],
        tool_executor: Any,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 1200,
        max_turns: int = 4,
    ) -> Dict[str, Any]:
        self._ensure_client()
        normalized_tools = [_normalize_tool_spec(tool) for tool in tools]

        if not normalized_tools:
            return {
                "text": self.generate_text(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                ),
                "tool_calls": [],
            }

        if self.provider == "groq":
            return self._generate_with_tools_groq(
                prompt=prompt,
                tools=normalized_tools,
                tool_executor=tool_executor,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                max_turns=max_turns,
            )

        if self.provider == "ollama":
            return self._generate_with_tools_ollama(
                prompt=prompt,
                tools=normalized_tools,
                tool_executor=tool_executor,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                max_turns=max_turns,
            )

        return self._generate_with_tools_gemini(
            prompt=prompt,
            tools=normalized_tools,
            tool_executor=tool_executor,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            max_turns=max_turns,
        )

    def _generate_with_tools_groq(
        self,
        prompt: str,
        tools: List[Dict[str, Any]],
        tool_executor: Any,
        system_prompt: Optional[str],
        temperature: float,
        max_tokens: int,
        max_turns: int,
    ) -> Dict[str, Any]:
        messages: List[Dict[str, Any]] = self._build_messages(prompt, system_prompt)
        executed: List[Dict[str, Any]] = []

        for _ in range(max_turns):
            response = self._groq_client.chat.completions.create(  # type: ignore[union-attr]
                model=self.model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=temperature,
                max_completion_tokens=max_tokens,
            )

            message = response.choices[0].message
            tool_calls = getattr(message, "tool_calls", None) or []
            if not tool_calls:
                return {"text": _coerce_provider_text(message.content).strip(), "tool_calls": executed}

            assistant_message = {
                "role": "assistant",
                "content": _coerce_provider_text(message.content),
                "tool_calls": [],
            }
            for tool_call in tool_calls:
                function = getattr(tool_call, "function", None)
                name = getattr(function, "name", "") if function is not None else ""
                arguments = _coerce_tool_arguments(
                    getattr(function, "arguments", None) if function is not None else None
                )
                assistant_message["tool_calls"].append(
                    {
                        "id": getattr(tool_call, "id", None),
                        "type": "function",
                        "function": {
                            "name": name,
                            "arguments": json.dumps(arguments, ensure_ascii=False),
                        },
                    }
                )
            messages.append(assistant_message)

            for tool_call in tool_calls:
                function = getattr(tool_call, "function", None)
                name = getattr(function, "name", "") if function is not None else ""
                arguments = _coerce_tool_arguments(
                    getattr(function, "arguments", None) if function is not None else None
                )
                try:
                    result = self._execute_tool(tool_executor, name, arguments)
                except Exception as exc:
                    result = {"error": str(exc)}

                executed.append({"name": name, "arguments": arguments, "result": result})
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": getattr(tool_call, "id", None),
                        "name": name,
                        "content": _stringify_tool_result(result),
                    }
                )

        return {"text": "", "tool_calls": executed}

    def _generate_with_tools_ollama(
        self,
        prompt: str,
        tools: List[Dict[str, Any]],
        tool_executor: Any,
        system_prompt: Optional[str],
        temperature: float,
        max_tokens: int,
        max_turns: int,
    ) -> Dict[str, Any]:
        messages: List[Dict[str, Any]] = self._build_messages(prompt, system_prompt)
        executed: List[Dict[str, Any]] = []

        for _ in range(max_turns):
            response = self._ollama_client.chat(  # type: ignore[union-attr]
                model=self.model,
                messages=messages,
                tools=tools,
                options={
                    "temperature": temperature,
                    "num_ctx": get_ollama_num_ctx(),
                    "num_predict": max_tokens,
                },
                think=False,
            )

            tool_calls = _extract_ollama_tool_calls(response)
            if not tool_calls:
                return {"text": _extract_ollama_content(response).strip(), "tool_calls": executed}

            messages.append(_extract_ollama_message(response))
            for tool_call in tool_calls:
                try:
                    result = self._execute_tool(tool_executor, tool_call["name"], tool_call["arguments"])
                except Exception as exc:
                    result = {"error": str(exc)}

                executed.append(
                    {
                        "name": tool_call["name"],
                        "arguments": tool_call["arguments"],
                        "result": result,
                    }
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_name": tool_call["name"],
                        "content": _stringify_tool_result(result),
                    }
                )

        return {"text": "", "tool_calls": executed}

    def _generate_with_tools_gemini(
        self,
        prompt: str,
        tools: List[Dict[str, Any]],
        tool_executor: Any,
        system_prompt: Optional[str],
        temperature: float,
        max_tokens: int,
        max_turns: int,
    ) -> Dict[str, Any]:
        if genai_types is None:
            raise RuntimeError("google-genai package is not installed")

        conversation: List[Any] = [prompt]
        config_kwargs: Dict[str, Any] = {
            "temperature": temperature,
            "tools": self._prepare_gemini_tools(tools),
        }
        if system_prompt:
            config_kwargs["system_instruction"] = system_prompt
        config = genai_types.GenerateContentConfig(**config_kwargs)
        executed: List[Dict[str, Any]] = []

        for _ in range(max_turns):
            response = self._gemini_client.models.generate_content(  # type: ignore[union-attr]
                model=self.model,
                contents=conversation,
                config=config,
            )

            tool_calls = _extract_gemini_function_calls(response)
            if not tool_calls:
                return {"text": (response.text or "").strip(), "tool_calls": executed}

            candidates = getattr(response, "candidates", None) or []
            if candidates:
                candidate_content = getattr(candidates[0], "content", None)
                if candidate_content is not None:
                    conversation.append(candidate_content)

            tool_response_parts = []
            for tool_call in tool_calls:
                try:
                    result = self._execute_tool(tool_executor, tool_call["name"], tool_call["arguments"])
                except Exception as exc:
                    result = {"error": str(exc)}

                executed.append(
                    {
                        "name": tool_call["name"],
                        "arguments": tool_call["arguments"],
                        "result": result,
                    }
                )
                tool_response_parts.append(
                    genai_types.Part.from_function_response(
                        name=tool_call["name"],
                        response={"result": result},
                    )
                )

            if tool_response_parts:
                conversation.append(genai_types.Content(role="tool", parts=tool_response_parts))

        return {"text": "", "tool_calls": executed}


def safe_load_json(raw_text: Any) -> Any:
    """Best-effort JSON loader that strips fenced code blocks first."""
    if not isinstance(raw_text, str):
        return raw_text

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
