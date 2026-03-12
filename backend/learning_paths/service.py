"""
Service layer for Wondering-style personalized learning paths.
"""
from __future__ import annotations

import json
import math
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config.settings import settings
from core.rag_pipeline import rag_pipeline
from documents.models import Document, ProcessingStatus
from learning_paths.models import (
    GoalDepth,
    LearningPath,
    LessonProgress,
    LessonProgressStatus,
    PathLesson,
    PathStatus,
    PathUnit,
    SourceMode,
)
from users.models import User
from utils.logger import logger
from utils.rag_llm_client import RAGLLMClient, safe_load_json

try:
    from groq import Groq
except ImportError:  # pragma: no cover
    Groq = None  # type: ignore


def _as_uuid_string(value: Any) -> str:
    return str(value) if value is not None else ""


def _as_enum_value(value: Any) -> str:
    return getattr(value, "value", value)


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return " ".join(value.strip().split())
    if isinstance(value, dict):
        for key in ("label", "text", "content", "value", "title", "name"):
            normalized = _normalize_text(value.get(key))
            if normalized:
                return normalized
        return ""
    if isinstance(value, list):
        return " ".join(part for part in (_normalize_text(item) for item in value) if part)
    return " ".join(str(value).strip().split())


def _normalize_answer(value: Optional[str]) -> str:
    cleaned = _normalize_text(value).lower()
    return "".join(ch for ch in cleaned if ch.isalnum() or ch.isspace()).strip()


def _truncate(value: Optional[str], limit: int = 700) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _suggest_path_title(topic: str) -> str:
    cleaned = _normalize_text(topic)
    if not cleaned:
        return "Personalized Learning Path"
    return cleaned[:255]


def _dedupe_preserve_order(values: Sequence[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for value in values:
        cleaned = _normalize_text(value)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(cleaned)
    return ordered


def _coerce_message_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(str(item) for item in value if item is not None)
    return str(value)


def _coerce_search_result(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        if isinstance(dumped, dict):
            return dumped
    if hasattr(value, "dict"):
        dumped = value.dict()
        if isinstance(dumped, dict):
            return dumped
    return {
        "title": getattr(value, "title", None),
        "url": getattr(value, "url", None),
        "content": getattr(value, "content", None),
        "score": getattr(value, "score", None),
    }


def _extract_tool_results(message: Any) -> List[Dict[str, Any]]:
    raw_tools = getattr(message, "executed_tools", None)
    if raw_tools is None and isinstance(message, dict):
        raw_tools = message.get("executed_tools")
    raw_tools = raw_tools or []

    extracted: List[Dict[str, Any]] = []
    for item in raw_tools:
        tool_type = getattr(item, "type", None) or (item.get("type") if isinstance(item, dict) else None)
        output = getattr(item, "output", None) or (item.get("output") if isinstance(item, dict) else None)
        search_results = getattr(item, "search_results", None) or (item.get("search_results") if isinstance(item, dict) else None)
        results = getattr(search_results, "results", None) if search_results is not None else None
        if results is None and isinstance(search_results, dict):
            results = search_results.get("results")
        normalized_results = [_coerce_search_result(result) for result in (results or [])]
        extracted.append(
            {
                "type": tool_type,
                "output": output,
                "results": normalized_results,
            }
        )
    return extracted


def _strict_object(properties: Dict[str, Any], required: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or list(properties.keys()),
        "additionalProperties": False,
    }


class LearningPathService:
    def __init__(self) -> None:
        self._structured_client = RAGLLMClient(
            provider="groq",
            model=settings.GROQ_STRUCTURED_MODEL,
        )
        self._setup_client = RAGLLMClient(
            provider="groq",
            model=settings.GROQ_SETUP_MODEL,
        )

    def _available_chat_models(self) -> List[str]:
        ordered_models = [
            settings.GROQ_STRUCTURED_MODEL,
            settings.GROQ_AGENT_MODEL,
            settings.GROQ_RESEARCH_MODEL,
        ]
        available: List[str] = []
        for model_name in ordered_models:
            cleaned = (model_name or "").strip()
            if cleaned and cleaned not in available:
                available.append(cleaned)
        return available

    def _select_chat_model(self, requested_model: Optional[str]) -> str:
        available_models = self._available_chat_models()
        default_model = settings.GROQ_AGENT_MODEL if settings.GROQ_AGENT_MODEL in available_models else available_models[0]
        if not requested_model:
            return default_model
        if requested_model not in available_models:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported chat model '{requested_model}'",
            )
        return requested_model

    def _get_groq_client(self) -> Any:
        if Groq is None:
            raise RuntimeError("groq package is not installed")
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")
        return Groq(api_key=settings.GROQ_API_KEY)

    def _load_owned_documents(
        self,
        db: Session,
        current_user: User,
        document_ids: Sequence[Any],
    ) -> List[Document]:
        if not document_ids:
            return []

        normalized_ids = [_as_uuid_string(doc_id) for doc_id in document_ids]
        documents = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.id.in_(list(document_ids)),
        ).all()
        found_ids = {_as_uuid_string(document.id) for document in documents}
        missing_ids = [doc_id for doc_id in normalized_ids if doc_id not in found_ids]
        if missing_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document(s) not found: {', '.join(missing_ids)}",
            )
        return documents

    def _collect_document_evidence(
        self,
        current_user: User,
        documents: Sequence[Document],
        topic: str,
        background: str,
        focus_areas: Sequence[str],
    ) -> List[Dict[str, Any]]:
        evidence: List[Dict[str, Any]] = []
        search_prompt = topic
        if focus_areas:
            search_prompt += f" Focus areas: {', '.join(focus_areas)}."
        if background:
            search_prompt += f" Learner background: {background}."

        source_index = 1
        for document in documents:
            title = document.title or document.original_filename or "Study source"
            if (
                document.processing_status == ProcessingStatus.COMPLETED
                and document.vector_db_reference_id
            ):
                results = rag_pipeline.search_similar(
                    query=search_prompt,
                    document_id=_as_uuid_string(document.id),
                    n_results=3,
                    user_id=_as_uuid_string(current_user.id),
                )
                for result in results.get("results", [])[:3]:
                    metadata = result.get("metadata") or {}
                    pages = metadata.get("page_numbers") or []
                    page_label = (
                        f"pages {', '.join(str(page) for page in pages[:3])}"
                        if pages
                        else f"chunk {metadata.get('chunk_index', 0) + 1}"
                    )
                    evidence.append(
                        {
                            "id": f"DOC-{source_index}",
                            "source_type": "pdf",
                            "title": title,
                            "locator": page_label,
                            "excerpt": _truncate(result.get("text"), 900),
                            "url": "",
                        }
                    )
                    source_index += 1
            elif document.extracted_text:
                evidence.append(
                    {
                        "id": f"DOC-{source_index}",
                        "source_type": "document",
                        "title": title,
                        "locator": "document excerpt",
                        "excerpt": _truncate(document.extracted_text, 900),
                        "url": "",
                    }
                )
                source_index += 1

            topics = ", ".join((document.topics or [])[:6])
            domains = ", ".join((document.domains or [])[:4])
            if topics or domains:
                evidence.append(
                    {
                        "id": f"DOC-{source_index}",
                        "source_type": "document",
                        "title": f"{title} metadata",
                        "locator": "document metadata",
                        "excerpt": _truncate(
                            f"Topics: {topics or 'n/a'}. Domains: {domains or 'n/a'}. "
                            f"Difficulty: {document.difficulty_level or 'unknown'}. "
                            f"Subject area: {document.subject_area or 'General'}.",
                            500,
                        ),
                        "url": "",
                    }
                )
                source_index += 1

        return evidence[:10]

    def _collect_web_evidence(
        self,
        topic: str,
        background: str,
        goal_depth: str,
        focus_areas: Sequence[str],
        seed_urls: Sequence[str],
        custom_instructions: Optional[str],
    ) -> List[Dict[str, Any]]:
        client = self._get_groq_client()
        evidence: List[Dict[str, Any]] = []

        research_prompt = f"""
Research a personalized learning path using fresh web information.

Topic: {topic}
Learner background: {background}
Goal depth: {goal_depth}
Focus areas: {', '.join(focus_areas) if focus_areas else 'none'}
Extra instructions: {custom_instructions or 'none'}

Find the most useful subtopics, practical angles, common misconceptions, and a sensible teaching sequence.
Keep the answer concise but source-aware.
""".strip()

        response = client.chat.completions.create(
            model=settings.GROQ_RESEARCH_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a research assistant. Use current web search when needed and synthesize a compact learning brief.",
                },
                {"role": "user", "content": research_prompt},
            ],
            temperature=0.2,
            max_completion_tokens=1200,
        )
        message = response.choices[0].message
        if getattr(message, "content", None):
            evidence.append(
                {
                    "id": "WEB-BRIEF",
                    "source_type": "web",
                    "title": "Live research brief",
                    "locator": "Groq compound synthesis",
                    "excerpt": _truncate(_coerce_message_text(getattr(message, "content", "")), 1200),
                    "url": "",
                }
            )

        tool_results = _extract_tool_results(message)
        web_index = 1
        for tool in tool_results:
            for result in (tool.get("results") or [])[:5]:
                evidence.append(
                    {
                        "id": f"WEB-{web_index}",
                        "source_type": "web",
                        "title": result.get("title") or "Web source",
                        "locator": result.get("url") or "search result",
                        "excerpt": _truncate(result.get("content") or tool.get("output"), 800),
                        "url": result.get("url") or "",
                    }
                )
                web_index += 1

        for url in seed_urls[:3]:
            visit_response = client.chat.completions.create(
                model=settings.GROQ_RESEARCH_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You analyze a single URL and extract only what helps build a learning path.",
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Summarize the most useful concepts, sequence, and practical insights from this page "
                            f"for teaching '{topic}' to a learner with background '{background}': {url}"
                        ),
                    },
                ],
                temperature=0.2,
                max_completion_tokens=900,
            )
            visit_message = visit_response.choices[0].message
            visit_tools = _extract_tool_results(visit_message)
            excerpt = _coerce_message_text(getattr(visit_message, "content", "")) or ""
            if visit_tools and visit_tools[0].get("output"):
                excerpt = visit_tools[0]["output"]
            evidence.append(
                {
                    "id": f"WEB-{web_index}",
                    "source_type": "url",
                    "title": f"Visited page: {url}",
                    "locator": url,
                    "excerpt": _truncate(excerpt, 900),
                    "url": url,
                }
            )
            web_index += 1

        return evidence[:10]

    def _build_path_schema(self) -> Dict[str, Any]:
        lesson_object = _strict_object(
            {
                "title": {"type": "string"},
                "objective": {"type": "string"},
                "duration_minutes": {"type": "integer"},
                "difficulty": {"type": "integer"},
                "unlock_hint": {"type": "string"},
                "exercise_type": {
                    "type": "string",
                    "enum": ["multiple_choice", "fill_blank", "order_steps"],
                },
                "key_terms": {"type": "array", "items": {"type": "string"}},
                "source_refs": {"type": "array", "items": {"type": "string"}},
            }
        )
        unit_object = _strict_object(
            {
                "title": {"type": "string"},
                "objective": {"type": "string"},
                "sequence_reason": {"type": "string"},
                "lessons": {"type": "array", "items": lesson_object},
            }
        )
        return _strict_object(
            {
                "title": {"type": "string"},
                "tagline": {"type": "string"},
                "rationale": {"type": "string"},
                "estimated_days": {"type": "integer"},
                "units": {"type": "array", "items": unit_object},
            }
        )

    def _build_setup_question_schema(self) -> Dict[str, Any]:
        return _strict_object(
            {
                "lead": {"type": "string"},
                "question": {"type": "string"},
                "options": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "multi_select": {"type": "boolean"},
            }
        )

    def _build_setup_summary_schema(self) -> Dict[str, Any]:
        return _strict_object(
            {
                "assistant_message": {"type": "string"},
                "course_title": {"type": "string"},
                "learning_goal": {"type": "string"},
                "background": {"type": "string"},
            }
        )

    def _build_lesson_schema(self) -> Dict[str, Any]:
        section_object = _strict_object(
            {
                "title": {"type": "string"},
                "content": {"type": "string"},
            }
        )
        source_ref_object = _strict_object(
            {
                "label": {"type": "string"},
                "source_type": {"type": "string"},
                "locator": {"type": "string"},
                "excerpt": {"type": "string"},
            }
        )
        exercise_object = _strict_object(
            {
                "type": {
                    "type": "string",
                    "enum": ["multiple_choice", "fill_blank", "order_steps"],
                },
                "prompt": {"type": "string"},
                "options": {"type": "array", "items": {"type": "string"}},
                "correct_option_index": {"type": "integer"},
                "acceptable_answers": {"type": "array", "items": {"type": "string"}},
                "correct_sequence": {"type": "array", "items": {"type": "string"}},
                "explanation": {"type": "string"},
            }
        )
        return _strict_object(
            {
                "hook": {"type": "string"},
                "tldr": {"type": "string"},
                "sections": {"type": "array", "items": section_object},
                "personalized_analogy": {"type": "string"},
                "diagram": _strict_object(
                    {
                        "title": {"type": "string"},
                        "mermaid": {"type": "string"},
                        "caption": {"type": "string"},
                    }
                ),
                "exercise": exercise_object,
                "mastery_check": _strict_object(
                    {
                        "prompt": {"type": "string"},
                        "success_criteria": {"type": "string"},
                    }
                ),
                "source_refs": {"type": "array", "items": source_ref_object},
            }
        )

    def _target_lesson_count(self, goal_depth: str, daily_minutes: int) -> int:
        baseline = {
            GoalDepth.BASICS.value: 6,
            GoalDepth.PRACTICAL.value: 8,
            GoalDepth.DEEP.value: 10,
        }.get(goal_depth, 8)
        if daily_minutes >= 30:
            baseline += 2
        elif daily_minutes <= 10:
            baseline -= 1
        return max(5, baseline)

    def _format_evidence_bundle(self, evidence: Sequence[Dict[str, Any]]) -> str:
        if not evidence:
            return "No external evidence was available."
        parts = []
        for item in evidence:
            locator = item.get("locator") or item.get("url") or "source"
            parts.append(
                f"[{item['id']}] {item['title']} ({item['source_type']}) - {locator}\n{item['excerpt']}"
            )
        return "\n\n".join(parts)

    def _sanitize_path_outline(
        self,
        outline: Dict[str, Any],
        *,
        topic: str,
        goal_depth: str,
        daily_minutes: int,
    ) -> Dict[str, Any]:
        cleaned_units: List[Dict[str, Any]] = []
        for unit in outline.get("units") or []:
            if not isinstance(unit, dict):
                continue

            cleaned_lessons: List[Dict[str, Any]] = []
            for lesson in unit.get("lessons") or []:
                if not isinstance(lesson, dict):
                    continue

                title = _normalize_text(lesson.get("title"))
                objective = _normalize_text(lesson.get("objective"))
                if not title or not objective:
                    continue

                try:
                    duration_minutes = int(lesson.get("duration_minutes") or 5)
                except (TypeError, ValueError):
                    duration_minutes = 5

                try:
                    difficulty = int(lesson.get("difficulty") or 1)
                except (TypeError, ValueError):
                    difficulty = 1

                exercise_type = _normalize_text(lesson.get("exercise_type")) or "multiple_choice"
                if exercise_type not in {"multiple_choice", "fill_blank", "order_steps"}:
                    exercise_type = "multiple_choice"

                cleaned_lessons.append(
                    {
                        "title": title,
                        "objective": objective,
                        "duration_minutes": max(3, min(8, duration_minutes)),
                        "difficulty": max(1, min(5, difficulty)),
                        "unlock_hint": _normalize_text(lesson.get("unlock_hint"))
                        or "Complete the previous step to unlock this lesson.",
                        "exercise_type": exercise_type,
                        "key_terms": _dedupe_preserve_order(
                            [_normalize_text(item) for item in (lesson.get("key_terms") or [])]
                        )[:8],
                        "source_refs": _dedupe_preserve_order(
                            [_normalize_text(item) for item in (lesson.get("source_refs") or [])]
                        )[:6],
                    }
                )

            unit_title = _normalize_text(unit.get("title"))
            unit_objective = _normalize_text(unit.get("objective"))
            if not unit_title or not unit_objective or not cleaned_lessons:
                continue

            cleaned_units.append(
                {
                    "title": unit_title,
                    "objective": unit_objective,
                    "sequence_reason": _normalize_text(unit.get("sequence_reason"))
                    or "Builds naturally on the previous unit.",
                    "lessons": cleaned_lessons,
                }
            )

        total_lessons = sum(len(unit["lessons"]) for unit in cleaned_units)
        return {
            "title": _normalize_text(outline.get("title")) or _suggest_path_title(topic),
            "tagline": _normalize_text(outline.get("tagline"))
            or f"Progress through {total_lessons or self._target_lesson_count(goal_depth, daily_minutes)} short lessons with steady momentum.",
            "rationale": _normalize_text(outline.get("rationale"))
            or f"A guided {goal_depth} path for {topic}, designed to fit a {daily_minutes}-minute daily pace.",
            "estimated_days": max(
                1,
                int(outline.get("estimated_days") or math.ceil((total_lessons or 1) * 5 / max(daily_minutes, 5))),
            ),
            "units": cleaned_units,
        }

    def _generate_path_outline(
        self,
        topic: str,
        background: str,
        course_title: Optional[str],
        learning_goal: Optional[str],
        goal_depth: str,
        daily_minutes: int,
        teaching_style: Sequence[str],
        focus_areas: Sequence[str],
        source_mode: str,
        custom_instructions: Optional[str],
        evidence: Sequence[Dict[str, Any]],
    ) -> Dict[str, Any]:
        prompt = f"""
Design a personalized learning path with short, sequential, motivating lessons.

Topic: {topic}
Learner background: {background}
Preferred course title: {course_title or 'derive the best concise title from the topic'}
Explicit learning goal: {learning_goal or 'derive the goal from the topic, background, and selected depth'}
Goal depth: {goal_depth}
Daily time budget: {daily_minutes} minutes
Teaching style preferences: {', '.join(teaching_style) if teaching_style else 'clear visuals and concrete explanations'}
Focus areas: {', '.join(focus_areas) if focus_areas else 'none'}
Source mode: {source_mode}
Extra instructions: {custom_instructions or 'none'}
Target lesson count: around {self._target_lesson_count(goal_depth, daily_minutes)} lessons total

Available evidence:
{self._format_evidence_bundle(evidence)}

Rules:
- Create 3 to 5 units.
- Keep each lesson suitable for 3 to 8 minutes.
- Sequence from foundations to application.
- Make the path feel like a progression system, not a textbook outline.
- Use source_refs only from the evidence IDs provided.
- Avoid inventing specific facts that are not supported by the evidence bundle.
""".strip()

        raw = self._structured_client.generate_json(
            prompt=prompt,
            system_prompt="You create concise, gamified learning paths. Return JSON only.",
            temperature=0.2,
            max_tokens=2400,
            schema=self._build_path_schema(),
        )
        outline = self._sanitize_path_outline(
            safe_load_json(raw),
            topic=topic,
            goal_depth=goal_depth,
            daily_minutes=daily_minutes,
        )
        units = outline.get("units") or []
        total_lessons = sum(len(unit.get("lessons") or []) for unit in units)
        if not units or total_lessons == 0:
            raise RuntimeError("Path generation returned no lessons")
        if _normalize_text(course_title):
            outline["title"] = course_title.strip()
        outline["estimated_days"] = max(1, int(outline.get("estimated_days") or math.ceil(total_lessons * 5 / max(daily_minutes, 5))))
        return outline

    def _generate_setup_question(
        self,
        *,
        topic: str,
        stage: str,
        background: Optional[str] = None,
    ) -> Dict[str, Any]:
        topic_label = _normalize_text(topic) or "this topic"
        fallback = self._fallback_setup_question(topic=topic_label, stage=stage, background=background)

        if stage == "background":
            prompt = f"""
Generate the next onboarding question for a learning path builder.

Topic: {topic}
Stage: background knowledge discovery

Rules:
- Ask about the learner's background, prior knowledge, or starting point for this topic.
- Keep the lead warm and concise.
- Write exactly 4 answer options.
- Each option should be specific, short, and plausible for the topic.
- multi_select must be false.
""".strip()
        else:
            prompt = f"""
Generate the next onboarding question for a learning path builder.

Topic: {topic}
Known background: {background or 'not provided'}
Stage: learning goal discovery

Rules:
- Acknowledge the user's background in one sentence before the question.
- Ask what they want to achieve with this topic.
- Write exactly 4 answer options.
- Options should be short, useful, and action-oriented.
- multi_select must be true.
""".strip()

        raw = self._setup_client.generate_json(
            prompt=prompt,
            system_prompt="You create onboarding questions for a guided learning-path product. Return JSON only.",
            temperature=0.35,
            max_tokens=700,
            schema=self._build_setup_question_schema(),
        )
        payload = safe_load_json(raw)
        options = _dedupe_preserve_order([_normalize_text(item) for item in (payload.get("options") or [])])
        if len(options) < 4:
            options = _dedupe_preserve_order([*options, *fallback["options"]])
        return {
            "lead": _normalize_text(payload.get("lead")) or fallback["lead"],
            "question": _normalize_text(payload.get("question")) or fallback["question"],
            "options": options[:4],
            "multi_select": bool(payload.get("multi_select")) if payload.get("multi_select") is not None else fallback["multi_select"],
        }

    def _fallback_setup_question(
        self,
        *,
        topic: str,
        stage: str,
        background: Optional[str] = None,
    ) -> Dict[str, Any]:
        if stage == "background":
            return {
                "lead": "To personalize your course, let’s understand your learning goal and background knowledge.",
                "question": f"Which starting point best matches your experience with {topic}?",
                "options": [
                    f"I’m completely new to {topic}.",
                    f"I know the basics of {topic} but want structure.",
                    f"I’ve used related ideas and want a stronger mental model.",
                    f"I already work with {topic} and want a deeper foundation.",
                ],
                "multi_select": False,
            }

        background_hint = _normalize_text(background)
        lead = (
            f"That’s a helpful foundation for learning about {topic}."
            if background_hint
            else f"That gives me enough context to shape your {topic} course."
        )
        return {
            "lead": lead,
            "question": f"What is your primary goal for learning about {topic}?",
            "options": [
                f"Understand the fundamentals of {topic}.",
                f"Apply {topic} in practical work or projects.",
                f"Build stronger intuition for research or analysis.",
                f"Go deeper into advanced ideas and tradeoffs.",
            ],
            "multi_select": True,
        }

    def generate_background_question(
        self,
        current_user: User,
        request: Any,
    ) -> Dict[str, Any]:
        _ = current_user
        return self._generate_setup_question(topic=request.topic, stage="background")

    def generate_goal_question(
        self,
        current_user: User,
        request: Any,
    ) -> Dict[str, Any]:
        _ = current_user
        return self._generate_setup_question(
            topic=request.topic,
            stage="goal",
            background=request.background,
        )

    def generate_setup_summary(
        self,
        current_user: User,
        request: Any,
    ) -> Dict[str, Any]:
        _ = current_user
        prompt = f"""
Summarize the setup for a guided learning path.

Topic: {request.topic}
Background knowledge: {request.background}
Chosen learner goals: {', '.join(request.selected_goals or []) or 'none provided'}
Goal depth: {getattr(request.goal_depth, 'value', request.goal_depth)}
Daily pace: {request.daily_minutes} minutes/day
Source mode: {getattr(request.source_mode, 'value', request.source_mode)}
Teaching style: {', '.join(request.teaching_style or []) or 'default'}
Focus areas: {', '.join(request.focus_areas or []) or 'none'}
Extra instructions: {request.custom_instructions or 'none'}

Rules:
- assistant_message should sound like a confident setup assistant.
- course_title must be concise and marketable.
- learning_goal must be one strong sentence.
- background must be a polished rewrite of the learner background knowledge.
""".strip()

        raw = self._setup_client.generate_json(
            prompt=prompt,
            system_prompt="You synthesize onboarding details for a guided course builder. Return JSON only.",
            temperature=0.35,
            max_tokens=900,
            schema=self._build_setup_summary_schema(),
        )
        payload = safe_load_json(raw)
        return {
            "assistant_message": _normalize_text(payload.get("assistant_message"))
            or "I've gathered enough information to design a course that fits your background and goals.",
            "course_title": _normalize_text(payload.get("course_title")) or _suggest_path_title(request.topic),
            "learning_goal": _normalize_text(payload.get("learning_goal"))
            or f"Build practical mastery in {request.topic}.",
            "background": _normalize_text(payload.get("background")) or request.background,
        }

    def _fetch_path_or_404(self, db: Session, current_user: User, path_id: str) -> LearningPath:
        path = db.query(LearningPath).filter(
            LearningPath.id == path_id,
            LearningPath.user_id == current_user.id,
        ).first()
        if not path:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning path not found")
        return path

    def _fetch_lesson_or_404(
        self,
        db: Session,
        current_user: User,
        path_id: str,
        lesson_id: str,
    ) -> tuple[LearningPath, PathLesson]:
        path = self._fetch_path_or_404(db, current_user, path_id)
        lesson = db.query(PathLesson).filter(
            PathLesson.id == lesson_id,
            PathLesson.path_id == path.id,
        ).first()
        if not lesson:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        return path, lesson

    def _get_path_documents(self, db: Session, path: LearningPath) -> List[Document]:
        source_document_ids = path.source_document_ids or []
        if not source_document_ids:
            return []
        return db.query(Document).filter(Document.id.in_(source_document_ids)).all()

    def _build_progress_maps(
        self,
        db: Session,
        current_user: User,
        path: LearningPath,
        lessons: Sequence[PathLesson],
    ) -> Dict[str, Any]:
        progress_rows = db.query(LessonProgress).filter(
            LessonProgress.user_id == current_user.id,
            LessonProgress.path_id == path.id,
        ).all()
        progress_map = {str(row.lesson_id): row for row in progress_rows}

        ordered_lessons = sorted(
            lessons,
            key=lambda lesson: (
                str(lesson.unit_id),
                lesson.order_index,
            ),
        )
        unit_order_map = {
            _as_uuid_string(unit.id): unit.order_index
            for unit in db.query(PathUnit).filter(PathUnit.path_id == path.id).all()
        }
        ordered_lessons.sort(
            key=lambda lesson: (unit_order_map.get(_as_uuid_string(lesson.unit_id), 0), lesson.order_index)
        )

        availability: Dict[str, Dict[str, bool]] = {}
        first_open_seen = False
        completed_count = 0
        next_lesson: Optional[PathLesson] = None

        for lesson in ordered_lessons:
            row = progress_map.get(_as_uuid_string(lesson.id))
            is_completed = bool(row and row.is_completed)
            if is_completed:
                completed_count += 1
                availability[_as_uuid_string(lesson.id)] = {
                    "is_available": True,
                    "is_locked": False,
                    "is_completed": True,
                }
                continue

            if not first_open_seen:
                first_open_seen = True
                next_lesson = lesson
                availability[_as_uuid_string(lesson.id)] = {
                    "is_available": True,
                    "is_locked": False,
                    "is_completed": False,
                }
            else:
                availability[_as_uuid_string(lesson.id)] = {
                    "is_available": False,
                    "is_locked": True,
                    "is_completed": False,
                }

        if not ordered_lessons:
            next_lesson = None

        return {
            "progress_map": progress_map,
            "availability": availability,
            "completed_count": completed_count,
            "next_lesson": next_lesson,
            "ordered_lessons": ordered_lessons,
        }

    def _serialize_progress_row(self, row: Optional[LessonProgress]) -> Dict[str, Any]:
        return {
            "status": _as_enum_value(row.status) if row else LessonProgressStatus.NOT_STARTED.value,
            "attempts": row.attempts if row else 0,
            "mastery_score": row.mastery_score if row else 0.0,
            "xp_earned": row.xp_earned if row else 0,
            "is_completed": bool(row and row.is_completed),
            "completed_at": row.completed_at if row else None,
            "last_submission": (row.last_submission or {}) if row else {},
        }

    def _serialize_path(
        self,
        db: Session,
        current_user: User,
        path: LearningPath,
    ) -> Dict[str, Any]:
        units = db.query(PathUnit).filter(PathUnit.path_id == path.id).order_by(PathUnit.order_index.asc()).all()
        lessons = db.query(PathLesson).filter(PathLesson.path_id == path.id).all()
        progress_bundle = self._build_progress_maps(db, current_user, path, lessons)
        progress_map = progress_bundle["progress_map"]
        availability = progress_bundle["availability"]
        next_lesson = progress_bundle["next_lesson"]
        completed_count = progress_bundle["completed_count"]

        lessons_by_unit: Dict[str, List[PathLesson]] = {}
        for lesson in lessons:
            lessons_by_unit.setdefault(_as_uuid_string(lesson.unit_id), []).append(lesson)
        for unit_lessons in lessons_by_unit.values():
            unit_lessons.sort(key=lambda lesson: lesson.order_index)

        unit_payloads = []
        for unit in units:
            lesson_payloads = []
            for lesson in lessons_by_unit.get(_as_uuid_string(unit.id), []):
                lesson_id = _as_uuid_string(lesson.id)
                lesson_payloads.append(
                    {
                        "id": lesson.id,
                        "unit_id": lesson.unit_id,
                        "title": lesson.title,
                        "objective": lesson.objective,
                        "duration_minutes": lesson.duration_minutes,
                        "difficulty": lesson.difficulty,
                        "unlock_hint": lesson.unlock_hint,
                        "exercise_type": lesson.exercise_type,
                        "key_terms": lesson.key_terms or [],
                        "source_refs": lesson.source_refs or [],
                        "is_available": availability.get(lesson_id, {}).get("is_available", False),
                        "is_locked": availability.get(lesson_id, {}).get("is_locked", True),
                        "is_completed": availability.get(lesson_id, {}).get("is_completed", False),
                        "progress": self._serialize_progress_row(progress_map.get(lesson_id)),
                    }
                )
            unit_payloads.append(
                {
                    "id": unit.id,
                    "path_id": unit.path_id,
                    "order_index": unit.order_index,
                    "title": unit.title,
                    "objective": unit.objective,
                    "sequence_reason": unit.sequence_reason,
                    "lessons": lesson_payloads,
                }
            )

        documents = self._get_path_documents(db, path)
        total_lessons = len(lessons)
        completion_percentage = int((completed_count / total_lessons) * 100) if total_lessons else 0
        return {
            "id": path.id,
            "title": path.title,
            "topic": path.topic,
            "background": path.background,
            "custom_instructions": path.custom_instructions,
            "tagline": path.tagline,
            "rationale": path.rationale,
            "goal_depth": _as_enum_value(path.goal_depth),
            "source_mode": _as_enum_value(path.source_mode),
            "status": _as_enum_value(path.status),
            "daily_minutes": path.daily_minutes,
            "estimated_days": path.estimated_days,
            "total_lessons": total_lessons,
            "completed_lessons": completed_count,
            "completion_percentage": completion_percentage,
            "teaching_style": path.teaching_style or [],
            "focus_areas": path.focus_areas or [],
            "source_documents": [
                {
                    "id": document.id,
                    "title": document.title or document.original_filename or "Study source",
                    "content_type": _as_enum_value(document.content_type),
                }
                for document in documents
            ],
            "next_lesson_id": next_lesson.id if next_lesson else None,
            "next_lesson_title": next_lesson.title if next_lesson else None,
            "units": unit_payloads,
            "created_at": path.created_at,
            "updated_at": path.updated_at,
        }

    def _serialize_path_card(
        self,
        db: Session,
        current_user: User,
        path: LearningPath,
    ) -> Dict[str, Any]:
        payload = self._serialize_path(db, current_user, path)
        return {
            "id": payload["id"],
            "title": payload["title"],
            "topic": payload["topic"],
            "tagline": payload["tagline"],
            "goal_depth": payload["goal_depth"],
            "source_mode": payload["source_mode"],
            "estimated_days": payload["estimated_days"],
            "total_lessons": payload["total_lessons"],
            "completed_lessons": payload["completed_lessons"],
            "completion_percentage": payload["completion_percentage"],
            "daily_minutes": payload["daily_minutes"],
            "teaching_style": payload["teaching_style"],
            "focus_areas": payload["focus_areas"],
            "next_lesson_id": payload["next_lesson_id"],
            "next_lesson_title": payload["next_lesson_title"],
            "created_at": payload["created_at"],
            "updated_at": payload["updated_at"],
        }

    def get_paths(self, db: Session, current_user: User) -> List[Dict[str, Any]]:
        paths = db.query(LearningPath).filter(
            LearningPath.user_id == current_user.id,
        ).order_by(LearningPath.updated_at.desc().nullslast(), LearningPath.created_at.desc()).all()
        return [self._serialize_path_card(db, current_user, path) for path in paths]

    def get_path(self, db: Session, current_user: User, path_id: str) -> Dict[str, Any]:
        path = self._fetch_path_or_404(db, current_user, path_id)
        return self._serialize_path(db, current_user, path)

    def update_path(
        self,
        db: Session,
        current_user: User,
        path_id: str,
        title: str,
    ) -> Dict[str, Any]:
        path = self._fetch_path_or_404(db, current_user, path_id)
        cleaned_title = _normalize_text(title)
        if len(cleaned_title) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Path title must be at least 3 characters",
            )
        path.title = cleaned_title
        db.add(path)
        db.commit()
        db.refresh(path)
        return self._serialize_path_card(db, current_user, path)

    def delete_path(
        self,
        db: Session,
        current_user: User,
        path_id: str,
    ) -> Dict[str, Any]:
        path = self._fetch_path_or_404(db, current_user, path_id)
        db.delete(path)
        db.commit()
        return {"success": True}

    def _build_curriculum_snapshot(self, path_payload: Dict[str, Any]) -> str:
        lines: List[str] = []
        for unit in path_payload.get("units", [])[:5]:
            lines.append(
                f"Unit {unit['order_index']}: {unit['title']} - {unit['objective']}"
            )
            for lesson in unit.get("lessons", [])[:6]:
                status_label = "completed"
                if not lesson.get("is_completed"):
                    status_label = "unlocked" if lesson.get("is_available") else "locked"
                lines.append(
                    f"- {lesson['title']} ({status_label}, {lesson['duration_minutes']} min, difficulty {lesson['difficulty']}): "
                    f"{lesson['objective']}"
                )
        return "\n".join(lines)

    def _build_selected_context(
        self,
        path_payload: Dict[str, Any],
        lesson: Optional[PathLesson],
        unit_id: Optional[str],
    ) -> str:
        selected_unit: Optional[Dict[str, Any]] = None
        selected_lesson: Optional[Dict[str, Any]] = None

        for unit in path_payload.get("units", []):
            if unit_id and _as_uuid_string(unit.get("id")) == unit_id:
                selected_unit = unit
            for lesson_payload in unit.get("lessons", []):
                if lesson and _as_uuid_string(lesson_payload.get("id")) == _as_uuid_string(lesson.id):
                    selected_unit = unit
                    selected_lesson = lesson_payload
                    break
            if selected_lesson:
                break

        parts: List[str] = []
        if selected_unit:
            parts.append(
                f"Selected unit: {selected_unit['title']} - {selected_unit['objective']}"
            )
            lesson_titles = [lesson_payload["title"] for lesson_payload in selected_unit.get("lessons", [])[:6]]
            if lesson_titles:
                parts.append(f"Unit lessons: {', '.join(lesson_titles)}")

        if selected_lesson:
            parts.append(
                f"Selected lesson: {selected_lesson['title']} - {selected_lesson['objective']}"
            )
            if selected_lesson.get("key_terms"):
                parts.append(f"Key terms: {', '.join(selected_lesson['key_terms'][:8])}")
            if selected_lesson.get("source_refs"):
                parts.append(f"Lesson source refs: {', '.join(selected_lesson['source_refs'][:6])}")

        if lesson and lesson.lesson_content:
            content = lesson.lesson_content or {}
            tldr = _truncate(content.get("tldr"), 400)
            if tldr:
                parts.append(f"Generated lesson TL;DR: {tldr}")
            section_titles = [section.get("title") for section in (content.get("sections") or []) if section.get("title")]
            if section_titles:
                parts.append(f"Generated lesson sections: {', '.join(section_titles[:5])}")

        return "\n".join(parts) if parts else "No lesson is selected yet. Help the learner decide what to tackle next."

    def _build_chat_sources(
        self,
        path_payload: Dict[str, Any],
        lesson: Optional[PathLesson],
        tool_results: Sequence[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        sources: List[Dict[str, Any]] = []

        for document in path_payload.get("source_documents", [])[:3]:
            sources.append(
                {
                    "label": document["title"],
                    "detail": f"Attached {document['content_type']} source",
                    "url": None,
                }
            )

        if lesson and lesson.lesson_content:
            for ref in (lesson.lesson_content or {}).get("source_refs", [])[:3]:
                sources.append(
                    {
                        "label": ref.get("label") or "Lesson evidence",
                        "detail": ref.get("locator") or _truncate(ref.get("excerpt"), 160),
                        "url": None,
                    }
                )

        for tool in tool_results:
            for result in (tool.get("results") or [])[:3]:
                sources.append(
                    {
                        "label": result.get("title") or "Live web source",
                        "detail": result.get("url") or _truncate(result.get("content"), 180),
                        "url": result.get("url") or None,
                    }
                )

        deduped: List[Dict[str, Any]] = []
        seen = set()
        for source in sources:
            key = (source.get("label"), source.get("detail"), source.get("url"))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(source)
        return deduped[:6]

    def chat(
        self,
        db: Session,
        current_user: User,
        path_id: str,
        request: Any,
    ) -> Dict[str, Any]:
        path = self._fetch_path_or_404(db, current_user, path_id)
        selected_model = self._select_chat_model(getattr(request, "model", None))
        selected_lesson: Optional[PathLesson] = None
        selected_unit_id = _as_uuid_string(getattr(request, "unit_id", None))

        if getattr(request, "lesson_id", None):
            path, selected_lesson = self._fetch_lesson_or_404(
                db,
                current_user,
                path_id,
                _as_uuid_string(request.lesson_id),
            )
            selected_unit_id = _as_uuid_string(selected_lesson.unit_id)

        if selected_unit_id:
            unit_exists = db.query(PathUnit).filter(
                PathUnit.id == selected_unit_id,
                PathUnit.path_id == path.id,
            ).first()
            if not unit_exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Selected unit not found in this learning path",
                )

        path_payload = self._serialize_path(db, current_user, path)
        source_titles = ", ".join(
            document["title"] for document in path_payload.get("source_documents", [])[:4]
        ) or "web research only"
        teaching_style = ", ".join(path_payload.get("teaching_style") or []) or "clear, concise explanations"
        focus_areas = ", ".join(path_payload.get("focus_areas") or []) or "general coverage"
        curriculum_snapshot = self._build_curriculum_snapshot(path_payload)
        selected_context = self._build_selected_context(path_payload, selected_lesson, selected_unit_id or None)

        user_messages = [
            {
                "role": message.role,
                "content": _truncate(message.content, 4000),
            }
            for message in (getattr(request, "messages", None) or [])[-18:]
            if _normalize_text(getattr(message, "content", ""))
        ]
        if not user_messages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one chat message is required",
            )

        system_prompt = f"""
You are the AI course copilot inside a personalized learning workspace.

Keep answers concise, practical, and easy to act on.
Prefer short paragraphs or flat bullets.
Stay grounded in the provided course context unless live search is available through the selected model.
If the user asks to revise the curriculum, explain the change you recommend instead of pretending the path is already edited.
If context is missing, say what is missing.

Path title: {path_payload['title']}
Topic: {path_payload['topic']}
Learner background: {path_payload['background']}
Goal depth: {path_payload['goal_depth']}
Daily pace: {path_payload['daily_minutes']} minutes/day
Teaching style: {teaching_style}
Focus areas: {focus_areas}
Source mode: {path_payload['source_mode']}
Attached sources: {source_titles}

Selected focus:
{selected_context}

Curriculum snapshot:
{curriculum_snapshot}
""".strip()

        response = self._get_groq_client().chat.completions.create(
            model=selected_model,
            messages=[{"role": "system", "content": system_prompt}, *user_messages],
            temperature=0.3,
            max_completion_tokens=900,
        )
        message = response.choices[0].message
        tool_results = _extract_tool_results(message)

        return {
            "answer": _coerce_message_text(getattr(message, "content", "")).strip(),
            "model": selected_model,
            "call_count": 1,
            "remembers_via_history": True,
            "used_live_tools": bool(tool_results),
            "history_turns_used": len(user_messages),
            "sources": self._build_chat_sources(path_payload, selected_lesson, tool_results),
        }

    def _prepare_outline_bundle(
        self,
        db: Session,
        current_user: User,
        request: Any,
    ) -> Dict[str, Any]:
        source_mode = request.source_mode.value if hasattr(request.source_mode, "value") else request.source_mode
        goal_depth = request.goal_depth.value if hasattr(request.goal_depth, "value") else request.goal_depth
        course_title = _normalize_text(getattr(request, "course_title", None))
        learning_goal = _normalize_text(getattr(request, "learning_goal", None))
        documents = self._load_owned_documents(db, current_user, request.document_ids)

        if source_mode in {SourceMode.PDF.value, SourceMode.HYBRID.value} and not documents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least one document for PDF or hybrid learning paths",
            )

        evidence: List[Dict[str, Any]] = []
        if source_mode in {SourceMode.PDF.value, SourceMode.HYBRID.value}:
            evidence.extend(
                self._collect_document_evidence(
                    current_user=current_user,
                    documents=documents,
                    topic=request.topic,
                    background=request.background,
                    focus_areas=request.focus_areas,
                )
            )

        if source_mode in {SourceMode.WEB.value, SourceMode.HYBRID.value}:
            evidence.extend(
                self._collect_web_evidence(
                    topic=request.topic,
                    background=request.background,
                    goal_depth=goal_depth,
                    focus_areas=request.focus_areas,
                    seed_urls=[str(url) for url in request.seed_urls],
                    custom_instructions=request.custom_instructions,
                )
            )

        if not evidence:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No usable evidence was found to build a learning path",
            )

        return {
            "source_mode": source_mode,
            "goal_depth": goal_depth,
            "course_title": course_title or None,
            "learning_goal": learning_goal or None,
            "documents": documents,
            "evidence": evidence,
        }

    def preview_path(
        self,
        db: Session,
        current_user: User,
        request: Any,
    ) -> Dict[str, Any]:
        bundle = self._prepare_outline_bundle(db, current_user, request)
        outline = self._generate_path_outline(
            topic=request.topic,
            background=request.background,
            course_title=bundle["course_title"],
            learning_goal=bundle["learning_goal"],
            goal_depth=bundle["goal_depth"],
            daily_minutes=request.daily_minutes,
            teaching_style=request.teaching_style,
            focus_areas=request.focus_areas,
            source_mode=bundle["source_mode"],
            custom_instructions=request.custom_instructions,
            evidence=bundle["evidence"],
        )
        units = outline.get("units") or []
        total_lessons = sum(len(unit.get("lessons") or []) for unit in units)
        return {
            "title": outline["title"],
            "tagline": outline["tagline"],
            "rationale": outline["rationale"],
            "estimated_days": int(outline["estimated_days"]),
            "total_lessons": total_lessons,
            "daily_minutes": request.daily_minutes,
            "learning_goal": bundle["learning_goal"],
            "units": units,
        }

    def generate_path(
        self,
        db: Session,
        current_user: User,
        request: Any,
    ) -> Dict[str, Any]:
        bundle = self._prepare_outline_bundle(db, current_user, request)
        source_mode = bundle["source_mode"]
        goal_depth = bundle["goal_depth"]
        documents = bundle["documents"]
        evidence = bundle["evidence"]

        outline = self._generate_path_outline(
            topic=request.topic,
            background=request.background,
            course_title=bundle["course_title"],
            learning_goal=bundle["learning_goal"],
            goal_depth=goal_depth,
            daily_minutes=request.daily_minutes,
            teaching_style=request.teaching_style,
            focus_areas=request.focus_areas,
            source_mode=source_mode,
            custom_instructions=request.custom_instructions,
            evidence=evidence,
        )

        path = LearningPath(
            user_id=current_user.id,
            title=outline["title"],
            topic=request.topic,
            background=request.background,
            custom_instructions=request.custom_instructions,
            goal_depth=GoalDepth(goal_depth),
            daily_minutes=request.daily_minutes,
            teaching_style=list(request.teaching_style or []),
            focus_areas=list(request.focus_areas or []),
            source_mode=SourceMode(source_mode),
            source_document_ids=[_as_uuid_string(doc.id) for doc in documents],
            tagline=outline["tagline"],
            rationale=outline["rationale"],
            estimated_days=int(outline["estimated_days"]),
            total_lessons=sum(len(unit.get("lessons") or []) for unit in outline.get("units") or []),
            status=PathStatus.READY,
            path_metadata={
                "request_profile": {
                    "topic": request.topic,
                    "background": request.background,
                    "course_title": bundle["course_title"],
                    "learning_goal": bundle["learning_goal"],
                    "goal_depth": goal_depth,
                    "daily_minutes": request.daily_minutes,
                    "teaching_style": list(request.teaching_style or []),
                    "focus_areas": list(request.focus_areas or []),
                    "source_mode": source_mode,
                    "seed_urls": [str(url) for url in request.seed_urls],
                },
                "evidence": evidence,
            },
        )
        db.add(path)
        db.flush()

        for unit_index, unit_data in enumerate(outline.get("units") or [], start=1):
            unit = PathUnit(
                path_id=path.id,
                order_index=unit_index,
                title=unit_data["title"],
                objective=unit_data["objective"],
                sequence_reason=unit_data["sequence_reason"],
            )
            db.add(unit)
            db.flush()

            for lesson_index, lesson_data in enumerate(unit_data.get("lessons") or [], start=1):
                lesson = PathLesson(
                    path_id=path.id,
                    unit_id=unit.id,
                    order_index=lesson_index,
                    title=lesson_data["title"],
                    objective=lesson_data["objective"],
                    duration_minutes=max(3, int(lesson_data["duration_minutes"])),
                    difficulty=max(1, min(5, int(lesson_data["difficulty"]))),
                    unlock_hint=lesson_data["unlock_hint"],
                    exercise_type=lesson_data["exercise_type"],
                    key_terms=list(lesson_data.get("key_terms") or []),
                    source_refs=list(lesson_data.get("source_refs") or []),
                )
                db.add(lesson)

        db.commit()
        db.refresh(path)
        logger.info("Created learning path %s for %s", path.id, current_user.email)
        return self._serialize_path(db, current_user, path)

    def _gather_lesson_evidence(
        self,
        db: Session,
        current_user: User,
        path: LearningPath,
        lesson: PathLesson,
    ) -> List[Dict[str, Any]]:
        evidence = list((path.path_metadata or {}).get("evidence") or [])
        documents = self._get_path_documents(db, path)
        if not documents:
            return evidence[:12]

        query = f"{lesson.title}. {lesson.objective}. Key terms: {', '.join(lesson.key_terms or [])}"
        source_index = 1
        for document in documents[:3]:
            if (
                document.processing_status == ProcessingStatus.COMPLETED
                and document.vector_db_reference_id
            ):
                results = rag_pipeline.search_similar(
                    query=query,
                    document_id=_as_uuid_string(document.id),
                    n_results=2,
                    user_id=_as_uuid_string(current_user.id),
                )
                for result in results.get("results", [])[:2]:
                    metadata = result.get("metadata") or {}
                    pages = metadata.get("page_numbers") or []
                    evidence.append(
                        {
                            "id": f"LESSON-DOC-{source_index}",
                            "source_type": "pdf",
                            "title": document.title or document.original_filename or "Study source",
                            "locator": f"pages {', '.join(str(page) for page in pages[:3])}" if pages else "retrieved chunk",
                            "excerpt": _truncate(result.get("text"), 800),
                            "url": "",
                        }
                    )
                    source_index += 1
        return evidence[:12]

    def _generate_lesson_content(
        self,
        db: Session,
        current_user: User,
        path: LearningPath,
        lesson: PathLesson,
    ) -> Dict[str, Any]:
        evidence = self._gather_lesson_evidence(db, current_user, path, lesson)
        units = db.query(PathUnit).filter(PathUnit.path_id == path.id).order_by(PathUnit.order_index.asc()).all()
        unit_map = {str(unit.id): unit for unit in units}
        current_unit = unit_map.get(_as_uuid_string(lesson.unit_id))
        lessons = db.query(PathLesson).filter(PathLesson.path_id == path.id).all()
        progress_bundle = self._build_progress_maps(db, current_user, path, lessons)
        ordered_lessons = progress_bundle["ordered_lessons"]
        lesson_ids = [_as_uuid_string(item.id) for item in ordered_lessons]
        current_index = lesson_ids.index(_as_uuid_string(lesson.id))
        previous_lesson = ordered_lessons[current_index - 1] if current_index > 0 else None
        next_lesson = ordered_lessons[current_index + 1] if current_index + 1 < len(ordered_lessons) else None

        prompt = f"""
Generate one short, personalized lesson for a guided learning path.

Path title: {path.title}
Topic: {path.topic}
Learner background: {path.background}
Goal depth: {_as_enum_value(path.goal_depth)}
Daily minutes: {path.daily_minutes}
Teaching style: {', '.join(path.teaching_style or []) if path.teaching_style else 'clear, visual, grounded'}
Focus areas: {', '.join(path.focus_areas or []) if path.focus_areas else 'none'}
Extra instructions: {path.custom_instructions or 'none'}

Current unit: {current_unit.title if current_unit else 'Current unit'}
Current lesson title: {lesson.title}
Lesson objective: {lesson.objective}
Lesson difficulty: {lesson.difficulty} / 5
Expected exercise type: {lesson.exercise_type}
Key terms: {', '.join(lesson.key_terms or []) if lesson.key_terms else 'none'}
Previous lesson: {previous_lesson.title if previous_lesson else 'none'}
Next lesson: {next_lesson.title if next_lesson else 'none'}

Available evidence:
{self._format_evidence_bundle(evidence)}

Rules:
- Keep the lesson compact and motivating.
- Use a personalized analogy based on the learner background or stated teaching style.
- The diagram mermaid should be simple and valid, preferably a flowchart TD.
- If exercise type is multiple_choice, provide 4 options and a valid correct_option_index.
- If exercise type is fill_blank, leave options empty and populate acceptable_answers.
- If exercise type is order_steps, set correct_sequence and include the same steps in options, but shuffled.
- Source refs must point to evidence IDs and include short supporting excerpts.
""".strip()

        raw = self._structured_client.generate_json(
            prompt=prompt,
            system_prompt="You create short, high-signal lessons for a gamified study path. Return JSON only.",
            temperature=0.2,
            max_tokens=2200,
            schema=self._build_lesson_schema(),
        )
        content = safe_load_json(raw)

        exercise = content.get("exercise") or {}
        if exercise.get("type") == "order_steps" and exercise.get("options"):
            options = list(exercise.get("options") or [])
            if options == exercise.get("correct_sequence"):
                random.shuffle(options)
                exercise["options"] = options

        lesson.lesson_content = content
        db.add(lesson)
        db.commit()
        db.refresh(lesson)
        return content

    def get_lesson(
        self,
        db: Session,
        current_user: User,
        path_id: str,
        lesson_id: str,
    ) -> Dict[str, Any]:
        path, lesson = self._fetch_lesson_or_404(db, current_user, path_id, lesson_id)
        lessons = db.query(PathLesson).filter(PathLesson.path_id == path.id).all()
        progress_bundle = self._build_progress_maps(db, current_user, path, lessons)
        progress_map = progress_bundle["progress_map"]
        availability = progress_bundle["availability"]
        ordered_lessons = progress_bundle["ordered_lessons"]
        ordered_ids = [_as_uuid_string(item.id) for item in ordered_lessons]
        current_index = ordered_ids.index(_as_uuid_string(lesson.id))
        previous_lesson = ordered_lessons[current_index - 1] if current_index > 0 else None
        next_lesson = ordered_lessons[current_index + 1] if current_index + 1 < len(ordered_lessons) else None
        lesson_id_key = _as_uuid_string(lesson.id)

        return {
            "id": lesson.id,
            "path_id": lesson.path_id,
            "unit_id": lesson.unit_id,
            "title": lesson.title,
            "objective": lesson.objective,
            "duration_minutes": lesson.duration_minutes,
            "difficulty": lesson.difficulty,
            "unlock_hint": lesson.unlock_hint,
            "exercise_type": lesson.exercise_type,
            "key_terms": lesson.key_terms or [],
            "source_refs": lesson.source_refs or [],
            "is_available": availability.get(lesson_id_key, {}).get("is_available", False),
            "is_locked": availability.get(lesson_id_key, {}).get("is_locked", True),
            "is_completed": availability.get(lesson_id_key, {}).get("is_completed", False),
            "progress": self._serialize_progress_row(progress_map.get(lesson_id_key)),
            "previous_lesson_id": previous_lesson.id if previous_lesson else None,
            "next_lesson_id": next_lesson.id if next_lesson else None,
            "content": lesson.lesson_content,
        }

    def generate_lesson(
        self,
        db: Session,
        current_user: User,
        path_id: str,
        lesson_id: str,
        regenerate: bool = False,
    ) -> Dict[str, Any]:
        path, lesson = self._fetch_lesson_or_404(db, current_user, path_id, lesson_id)
        lesson_detail = self.get_lesson(db, current_user, path_id, lesson_id)
        if lesson_detail["is_locked"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Complete the current unlocked lesson before opening this one",
            )
        if lesson.lesson_content and not regenerate:
            return lesson_detail
        self._generate_lesson_content(db, current_user, path, lesson)
        return self.get_lesson(db, current_user, path_id, lesson_id)

    def complete_lesson(
        self,
        db: Session,
        current_user: User,
        path_id: str,
        lesson_id: str,
        selected_option_index: Optional[int],
        text_answer: Optional[str],
        ordered_steps: Sequence[str],
    ) -> Dict[str, Any]:
        path, lesson = self._fetch_lesson_or_404(db, current_user, path_id, lesson_id)
        lesson_detail = self.get_lesson(db, current_user, path_id, lesson_id)
        if lesson_detail["is_locked"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This lesson is still locked",
            )

        if not lesson.lesson_content:
            self._generate_lesson_content(db, current_user, path, lesson)
            lesson_detail = self.get_lesson(db, current_user, path_id, lesson_id)

        exercise = ((lesson.lesson_content or {}).get("exercise") or {})
        exercise_type = exercise.get("type", lesson.exercise_type)
        correct = False
        feedback = exercise.get("explanation", "Review the key idea and try again.")

        if exercise_type == "multiple_choice":
            if selected_option_index is not None:
                correct = int(selected_option_index) == int(exercise.get("correct_option_index", -1))
            elif text_answer:
                options = exercise.get("options") or []
                correct_index = int(exercise.get("correct_option_index", -1))
                if 0 <= correct_index < len(options):
                    correct = _normalize_answer(text_answer) == _normalize_answer(options[correct_index])
        elif exercise_type == "fill_blank":
            acceptable = {_normalize_answer(item) for item in (exercise.get("acceptable_answers") or [])}
            correct = bool(text_answer and _normalize_answer(text_answer) in acceptable)
        elif exercise_type == "order_steps":
            submitted = [_normalize_answer(item) for item in ordered_steps]
            expected = [_normalize_answer(item) for item in (exercise.get("correct_sequence") or [])]
            correct = bool(submitted and submitted == expected)

        progress_row = db.query(LessonProgress).filter(
            LessonProgress.user_id == current_user.id,
            LessonProgress.path_id == path.id,
            LessonProgress.lesson_id == lesson.id,
        ).first()
        if not progress_row:
            progress_row = LessonProgress(
                user_id=current_user.id,
                path_id=path.id,
                lesson_id=lesson.id,
            )
            db.add(progress_row)

        progress_row.attempts = int(progress_row.attempts or 0)
        progress_row.mastery_score = float(progress_row.mastery_score or 0.0)
        progress_row.xp_earned = int(progress_row.xp_earned or 0)
        progress_row.is_completed = bool(progress_row.is_completed)

        progress_row.attempts += 1
        progress_row.mastery_score = 1.0 if correct else max(progress_row.mastery_score, 0.35)
        progress_row.xp_earned = max(
            progress_row.xp_earned,
            (lesson.duration_minutes * 3) + (lesson.difficulty * 2 if correct else lesson.difficulty),
        )
        progress_row.status = LessonProgressStatus.COMPLETED if correct else LessonProgressStatus.REVIEW_DUE
        progress_row.is_completed = correct
        progress_row.completed_at = datetime.now(timezone.utc) if correct else None
        progress_row.last_submission = {
            "selected_option_index": selected_option_index,
            "text_answer": text_answer,
            "ordered_steps": list(ordered_steps or []),
            "correct": correct,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }

        db.add(progress_row)
        db.commit()
        db.refresh(progress_row)

        feedback_prefix = "Correct." if correct else "Not quite."
        return {
            "correct": correct,
            "xp_earned": progress_row.xp_earned,
            "status": _as_enum_value(progress_row.status),
            "feedback": f"{feedback_prefix} {feedback}",
            "progress": self._serialize_progress_row(progress_row),
        }


learning_path_service = LearningPathService()
