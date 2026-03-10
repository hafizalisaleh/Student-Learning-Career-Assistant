"""
Provider-aware quiz generator using the unified RAG LLM client.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence

from utils.logger import logger
from utils.rag_llm_client import RAGLLMClient, safe_load_json


def _normalize_whitespace(text: str) -> str:
    cleaned = (text or "").replace("\r\n", "\n")
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()


def _build_source_excerpt(content: str, max_chars: int = 14000) -> str:
    """
    Keep strong coverage across the document instead of truncating to the first page.
    """
    cleaned = _normalize_whitespace(content)
    if len(cleaned) <= max_chars:
        return cleaned

    sections = [segment.strip() for segment in cleaned.split("\n\n") if segment.strip()]
    if not sections:
        return cleaned[:max_chars]

    selected: List[str] = []
    total = 0
    front_index = 0
    back_index = len(sections) - 1
    take_from_front = True

    while front_index <= back_index and total < max_chars:
        segment = sections[front_index] if take_from_front else sections[back_index]
        candidate = f"{segment}\n\n"
        if total + len(candidate) > max_chars and selected:
            break
        selected.append(segment)
        total += len(candidate)
        if take_from_front:
            front_index += 1
        else:
            back_index -= 1
        take_from_front = not take_from_front

    return "\n\n".join(selected).strip()[:max_chars]


def _coerce_option(option: Any) -> str:
    if isinstance(option, dict):
        for key in ("text", "label", "value", "option"):
            value = option.get(key)
            if value:
                return _normalize_whitespace(str(value))
        return _normalize_whitespace(str(option))
    return _normalize_whitespace(str(option))


def _normalize_support_text(text: str) -> str:
    cleaned = _normalize_whitespace(text).lower().replace("×", "x")
    cleaned = re.sub(r"[^a-z0-9%<>=+]+", " ", cleaned)
    return " ".join(cleaned.split())


def _build_evidence_blocks(evidence_chunks: Sequence[Dict[str, Any]], max_chars: int = 1600) -> str:
    blocks: List[str] = []

    for index, chunk in enumerate(evidence_chunks, start=1):
        metadata = chunk.get("metadata") or {}
        title = metadata.get("document_title") or "Source"
        page_numbers = metadata.get("page_numbers") or metadata.get("pages") or []
        if page_numbers:
            page_label = ", ".join(str(page) for page in page_numbers)
        else:
            page_label = metadata.get("page_number") or "Unknown"
        modality = metadata.get("source_modality") or metadata.get("chunk_method") or "text"
        excerpt = _normalize_whitespace(str(chunk.get("text", "")))[:max_chars]

        blocks.append(
            f"[SOURCE {index}] {title} | pages={page_label} | modality={modality}\n{excerpt}"
        )

    return "\n\n".join(blocks).strip()


def _fallback_quiz_title(
    selected_topics: Optional[Sequence[str]] = None,
    selected_subtopics: Optional[Sequence[str]] = None,
) -> str:
    focus_terms = [
        *(item.strip() for item in (selected_subtopics or []) if item and item.strip()),
        *(item.strip() for item in (selected_topics or []) if item and item.strip()),
    ]
    if not focus_terms:
        return "Focused Study Quiz"

    joined = " + ".join(focus_terms[:2])
    if len(joined) > 48:
        joined = joined[:45].rstrip(" ,;:-") + "..."
    return f"{joined} Quiz"


class QuizGenerator:
    """Generate grounded quizzes from retrieved document content."""

    QUESTION_TYPE_LABELS = {
        "mcq": "multiple choice with exactly four options",
        "short": "short answer in 1-3 sentences",
        "true_false": "true or false",
        "fill_blank": "fill in the blank",
    }
    QUESTION_TYPE_ALIASES = {
        "multiple_choice": "mcq",
        "multiple choice": "mcq",
        "mcq": "mcq",
        "short_answer": "short",
        "short answer": "short",
        "short": "short",
        "true_false": "true_false",
        "true false": "true_false",
        "true-false": "true_false",
        "fill_blank": "fill_blank",
        "fill in the blank": "fill_blank",
        "fill-in-the-blank": "fill_blank",
    }

    def __init__(self):
        self.client = RAGLLMClient()

    def generate_quiz_title(
        self,
        content: str,
        difficulty: str,
        allowed_types: Sequence[str],
        selected_topics: Optional[Sequence[str]] = None,
        selected_subtopics: Optional[Sequence[str]] = None,
        focus_context: Optional[str] = None,
    ) -> str:
        fallback = _fallback_quiz_title(selected_topics, selected_subtopics)
        focus_lines = []
        if selected_topics:
            focus_lines.append("Topics: " + ", ".join(selected_topics[:6]))
        if selected_subtopics:
            focus_lines.append("Subtopics: " + ", ".join(selected_subtopics[:6]))
        focus_block = "\n".join(focus_lines) or "No explicit focus provided."

        prompt = f"""
Create a concise, human-readable title for a study quiz.

Rules:
- 2 to 8 words.
- No quotation marks.
- No colon unless truly necessary.
- Make it sound like a quiz title a student would understand instantly.
- Reflect the selected focus when provided.
- Do not mention page numbers.
- Do not include the word "generated".

Difficulty: {difficulty}
Question types: {", ".join(allowed_types)}
Focus:
{focus_block}

Additional focus context:
{focus_context or "None"}

Source excerpt:
{_build_source_excerpt(content, max_chars=1800)}
""".strip()

        schema = {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
            },
            "required": ["title"],
        }

        try:
            raw = self.client.generate_json(
                prompt=prompt,
                system_prompt="Return only valid JSON with a single concise quiz title.",
                temperature=0.2,
                max_tokens=120,
                schema=schema,
            )
            parsed = safe_load_json(raw)
            title = _normalize_whitespace(parsed.get("title", "")) if isinstance(parsed, dict) else ""
            if title:
                return title[:80]
        except Exception as exc:
            logger.warning("QuizGenerator title generation fell back to deterministic title: %s", exc)

        return fallback

    def generate_mcq_questions(
        self,
        content: str,
        num_questions: int,
        difficulty: str,
        focus_context: str | None = None,
        evidence_chunks: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        return self._generate_questions(
            content,
            num_questions,
            difficulty,
            ["mcq"],
            focus_context,
            evidence_chunks=evidence_chunks,
        )

    def generate_short_answer_questions(
        self,
        content: str,
        num_questions: int,
        difficulty: str,
        focus_context: str | None = None,
        evidence_chunks: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        return self._generate_questions(
            content,
            num_questions,
            difficulty,
            ["short"],
            focus_context,
            evidence_chunks=evidence_chunks,
        )

    def generate_true_false_questions(
        self,
        content: str,
        num_questions: int,
        difficulty: str,
        focus_context: str | None = None,
        evidence_chunks: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        return self._generate_questions(
            content,
            num_questions,
            difficulty,
            ["true_false"],
            focus_context,
            evidence_chunks=evidence_chunks,
        )

    def generate_fill_blank_questions(
        self,
        content: str,
        num_questions: int,
        difficulty: str,
        focus_context: str | None = None,
        evidence_chunks: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        return self._generate_questions(
            content,
            num_questions,
            difficulty,
            ["fill_blank"],
            focus_context,
            evidence_chunks=evidence_chunks,
        )

    def generate_mixed_questions(
        self,
        content: str,
        num_questions: int,
        difficulty: str,
        focus_context: str | None = None,
        evidence_chunks: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        generation_plan = self._build_mixed_question_plan(num_questions)
        generated_by_type: Dict[str, List[Dict[str, Any]]] = {}

        for question_type in ("mcq", "short", "true_false", "fill_blank"):
            required_count = generation_plan.count(question_type)
            if required_count <= 0:
                continue
            generated_by_type[question_type] = self._generate_questions(
                content,
                required_count,
                difficulty,
                [question_type],
                focus_context,
                evidence_chunks=evidence_chunks,
            )

        merged: List[Dict[str, Any]] = []
        seen_questions = set()
        cursors = {question_type: 0 for question_type in generated_by_type}

        for question_type in generation_plan:
            bucket = generated_by_type.get(question_type, [])
            cursor = cursors.get(question_type, 0)
            if cursor >= len(bucket):
                continue
            question = bucket[cursor]
            cursors[question_type] = cursor + 1
            normalized_key = _normalize_support_text(question.get("question_text", ""))
            if not normalized_key or normalized_key in seen_questions:
                continue
            seen_questions.add(normalized_key)
            merged.append(question)

        if len(merged) < num_questions:
            for question_type in ("mcq", "short", "true_false", "fill_blank"):
                bucket = generated_by_type.get(question_type, [])
                cursor = cursors.get(question_type, 0)
                for question in bucket[cursor:]:
                    normalized_key = _normalize_support_text(question.get("question_text", ""))
                    if not normalized_key or normalized_key in seen_questions:
                        continue
                    seen_questions.add(normalized_key)
                    merged.append(question)
                    if len(merged) >= num_questions:
                        break
                if len(merged) >= num_questions:
                    break

        return merged[:num_questions]

    def _build_mixed_question_plan(self, num_questions: int) -> List[str]:
        cycle = ["mcq", "short", "true_false", "fill_blank"]
        plan: List[str] = []
        while len(plan) < num_questions:
            for question_type in cycle:
                if len(plan) >= num_questions:
                    break
                plan.append(question_type)
        return plan

    def _generate_questions(
        self,
        content: str,
        num_questions: int,
        difficulty: str,
        allowed_types: Sequence[str],
        focus_context: str | None = None,
        evidence_chunks: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        difficulty_instructions = {
            "easy": "Focus on foundational recall, key terminology, explicit facts, and very direct understanding checks.",
            "medium": "Focus on understanding, comparison, causal links, and light application of the material.",
            "hard": "Focus on synthesis, subtle distinctions, multi-step reasoning, and transfer across sections of the source.",
        }

        excerpt = _build_source_excerpt(content)
        source_blocks = _build_evidence_blocks(evidence_chunks or [])
        type_names = ", ".join(allowed_types)
        type_help = "\n".join(
            f"- {qtype}: {self.QUESTION_TYPE_LABELS[qtype]}" for qtype in allowed_types
        )
        focus_block = (
            f"\nFOCUS PRIORITY:\n{focus_context}\n"
            if focus_context
            else "\nFOCUS PRIORITY:\nNo special weak-area focus. Cover the most important and testable parts of the source.\n"
        )

        schema = {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "question_text": {"type": "string"},
                            "question_type": {
                                "type": "string",
                                "enum": list(allowed_types),
                            },
                            "options": {
                                "type": ["array", "null"],
                                "items": {"type": "string"},
                            },
                            "correct_answer": {"type": "string"},
                            "explanation": {"type": "string"},
                            "source_index": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": max(1, len(evidence_chunks or [])),
                            },
                        },
                        "required": [
                            "question_text",
                            "question_type",
                            "correct_answer",
                            "explanation",
                            "source_index",
                        ],
                    },
                }
            },
            "required": ["questions"],
        }

        system_prompt = (
            "You generate high-quality study quizzes grounded strictly in the provided source material. "
            "Never invent facts that are not supported by the source. "
            "Write clear questions, keep explanations concise but useful, vary the source coverage, "
            "and attach each question to the most relevant source block."
        )

        prompt = f"""
Generate {num_questions} quiz questions using ONLY the source material below.

ALLOWED QUESTION TYPES:
{type_names}
Use these exact values in the JSON field `question_type`.
Type meanings:
{type_help}

DIFFICULTY:
{difficulty}
{difficulty_instructions.get(difficulty, difficulty_instructions["medium"])}
{focus_block}
QUESTION WRITING RULES:
- Cover different parts of the source instead of repeating the same fact.
- Prefer conceptually important details, not trivia.
- Do not ask about metadata like page numbers or filenames.
- Every explanation must state why the answer is correct using the source block you chose.
- Set `source_index` to the SOURCE block number that best supports the question.
- Prefer conceptual or comparative questions over isolated raw numbers.
- Only ask a numeric/value question when one source block states that value clearly and unambiguously.
- For `mcq`, produce exactly 4 options and make the correct answer one of those options.
- For `true_false`, set options to ["True", "False"] and correct_answer to either "True" or "False".
- For `fill_blank`, include a visible blank marker such as "_____" in the question.
- For `short`, make the expected answer 1-3 sentences, not a single word unless the source requires it.

SOURCE BLOCKS:
{source_blocks or "No structured source blocks available. Ground questions in the source material and set source_index to 1."}

SOURCE MATERIAL:
{excerpt}

Return valid JSON with the schema provided.
""".strip()

        sanitized: List[Dict[str, Any]] = []
        try:
            raw = self.client.generate_json(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=0.25,
                max_tokens=3200,
                schema=schema,
            )
            parsed = safe_load_json(raw)
            generated_questions = parsed.get("questions", []) if isinstance(parsed, dict) else []
            sanitized = self._sanitize_questions(
                generated_questions,
                allowed_types,
                max_source_index=max(1, len(evidence_chunks or [])),
            )
        except Exception as exc:
            logger.warning("QuizGenerator primary structured generation failed; retrying with simplified JSON prompt: %s", exc)

        if not sanitized:
            logger.warning("QuizGenerator could not sanitize any generated questions; retrying with a simpler prompt")
            retry_prompt = f"""
Generate {num_questions} quiz questions as strict JSON using ONLY the source material below.

Use exactly one question type value: {allowed_types[0] if len(allowed_types) == 1 else ", ".join(allowed_types)}.
{focus_block}
Rules:
- Keep the quiz inside the selected focus when one is provided.
- Every question must be answerable from the source blocks.
- Every explanation must match the chosen correct answer.
- Set source_index to the most relevant SOURCE block.
Return:
{{
  "questions": [
    {{
      "question_text": "string",
      "question_type": "{allowed_types[0] if len(allowed_types) == 1 else allowed_types[0]}",
      "options": ["string", "string", "string", "string"],
      "correct_answer": "string",
      "explanation": "string",
      "source_index": 1
    }}
  ]
}}

SOURCE BLOCKS:
{source_blocks or "[SOURCE 1] General source excerpt"}

SOURCE MATERIAL:
{excerpt}
""".strip()
            try:
                retry_raw = self.client.generate_json(
                    prompt=retry_prompt,
                    system_prompt="Return only valid JSON. Do not rename keys. Do not add prose.",
                    temperature=0.1,
                    max_tokens=3200,
                )
                retry_parsed = safe_load_json(retry_raw)
                retry_questions = retry_parsed.get("questions", []) if isinstance(retry_parsed, dict) else []
                sanitized = self._sanitize_questions(
                    retry_questions,
                    allowed_types,
                    max_source_index=max(1, len(evidence_chunks or [])),
                )
            except Exception as exc:
                logger.warning("QuizGenerator simplified JSON retry failed; falling back to plain text JSON prompt: %s", exc)

        if not sanitized:
            try:
                text_retry_raw = self.client.generate_text(
                    prompt=retry_prompt,
                    system_prompt="Return only valid JSON. Do not rename keys. Do not add prose.",
                    temperature=0.0,
                    max_tokens=3200,
                )
                text_retry_parsed = safe_load_json(text_retry_raw)
                text_retry_questions = text_retry_parsed.get("questions", []) if isinstance(text_retry_parsed, dict) else []
                sanitized = self._sanitize_questions(
                    text_retry_questions,
                    allowed_types,
                    max_source_index=max(1, len(evidence_chunks or [])),
                )
            except Exception as exc:
                logger.warning("QuizGenerator plain-text JSON fallback failed: %s", exc)

        if not sanitized:
            raise RuntimeError("Model returned no usable questions")

        validated = self._validate_grounded_questions(
            sanitized,
            evidence_chunks or [],
        )
        return validated[:num_questions]

    def _validate_grounded_questions(
        self,
        questions: Sequence[Dict[str, Any]],
        evidence_chunks: Sequence[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        if not questions:
            return []

        validated = [dict(question) for question in questions]
        unresolved_items: List[Dict[str, Any]] = []

        for index, question in enumerate(validated):
            if question.get("question_type") != "mcq":
                continue

            options = question.get("options") or []
            if not options:
                continue

            try:
                source_index = int(question.get("source_index", 1)) - 1
            except (TypeError, ValueError):
                source_index = 0

            source_text = ""
            if 0 <= source_index < len(evidence_chunks):
                source_text = str(evidence_chunks[source_index].get("text", ""))

            supported_answer = self._resolve_supported_mcq_answer(question, source_text)
            if supported_answer and supported_answer != question.get("correct_answer"):
                logger.info(
                    "QuizGenerator corrected MCQ answer via evidence match: '%s' -> '%s'",
                    question.get("correct_answer"),
                    supported_answer,
                )
                question["correct_answer"] = supported_answer
                continue

            if supported_answer is None:
                unresolved_items.append(
                    {
                        "question_index": index,
                        "question": question,
                        "source_text": source_text,
                    }
                )

        if unresolved_items:
            corrections = self._verify_mcq_answers_with_llm(unresolved_items)
            for item in unresolved_items:
                corrected_answer = corrections.get(item["question_index"])
                options = item["question"].get("options") or []
                if corrected_answer in options and corrected_answer != item["question"].get("correct_answer"):
                    logger.info(
                        "QuizGenerator corrected MCQ answer via verifier: '%s' -> '%s'",
                        item["question"].get("correct_answer"),
                        corrected_answer,
                    )
                    validated[item["question_index"]]["correct_answer"] = corrected_answer

        return validated

    def validate_grounded_questions(
        self,
        questions: Sequence[Dict[str, Any]],
        evidence_chunks: Sequence[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Public defensive validation hook for callers that want to re-check
        persisted question payloads against their evidence before saving.
        """
        return self._validate_grounded_questions(questions, evidence_chunks)

    def _resolve_supported_mcq_answer(
        self,
        question: Dict[str, Any],
        source_text: str,
    ) -> Optional[str]:
        options = question.get("options") or []
        if not options:
            return None

        support_haystack = _normalize_support_text(
            "\n".join([
                source_text or "",
                str(question.get("explanation", "")),
            ])
        )
        if not support_haystack:
            return None

        supported_options: List[str] = []
        haystack = f" {support_haystack} "
        for option in options:
            normalized_option = _normalize_support_text(option)
            if not normalized_option:
                continue
            needle = f" {normalized_option} "
            if (
                needle in haystack
                or haystack.startswith(f" {normalized_option}")
                or haystack.endswith(f"{normalized_option} ")
            ):
                supported_options.append(option)

        if not supported_options:
            return None

        if question.get("correct_answer") in supported_options:
            return question.get("correct_answer")

        if len(supported_options) == 1:
            return supported_options[0]

        return None

    def _verify_mcq_answers_with_llm(
        self,
        unresolved_items: Sequence[Dict[str, Any]],
    ) -> Dict[int, str]:
        if not unresolved_items:
            return {}

        schema = {
            "type": "object",
            "properties": {
                "corrections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "question_index": {"type": "integer"},
                            "correct_answer": {"type": "string"},
                        },
                        "required": ["question_index", "correct_answer"],
                    },
                }
            },
            "required": ["corrections"],
        }

        prompt_items: List[str] = []
        for item in unresolved_items:
            question = item["question"]
            options = question.get("options") or []
            option_lines = "\n".join(f"- {option}" for option in options)
            prompt_items.append(
                f"""Question index: {item['question_index']}
Question: {question.get('question_text', '')}
Current correct answer: {question.get('correct_answer', '')}
Options:
{option_lines}
Explanation draft: {question.get('explanation', '')}
Source excerpt:
{_normalize_whitespace(item.get('source_text', ''))[:1400]}"""
            )

        prompt = (
            "Validate the correct answer for each multiple-choice question using ONLY the provided source excerpt.\n"
            "Choose exactly one of the provided options for each item.\n"
            "If the current correct answer is already supported, keep it.\n\n"
            + "\n\n".join(prompt_items)
        )

        try:
            raw = self.client.generate_json(
                prompt=prompt,
                system_prompt=(
                    "Return only valid JSON. For each item, choose the option best supported by the source excerpt. "
                    "Never invent an option."
                ),
                temperature=0.0,
                max_tokens=800,
                schema=schema,
            )
            parsed = safe_load_json(raw)
            corrections = parsed.get("corrections", []) if isinstance(parsed, dict) else []
            return {
                int(item["question_index"]): _normalize_whitespace(str(item["correct_answer"]))
                for item in corrections
                if isinstance(item, dict)
                and str(item.get("question_index", "")).isdigit()
                and item.get("correct_answer")
            }
        except Exception as exc:
            logger.warning("QuizGenerator MCQ verifier fallback skipped: %s", exc)
            return {}

    def _sanitize_questions(
        self,
        questions: Sequence[Dict[str, Any]],
        allowed_types: Sequence[str],
        max_source_index: int = 1,
    ) -> List[Dict[str, Any]]:
        cleaned: List[Dict[str, Any]] = []

        for question in questions:
            if not isinstance(question, dict):
                continue

            question_type = self._normalize_question_type(question.get("question_type"))
            if question_type not in allowed_types and len(allowed_types) == 1:
                question_type = allowed_types[0]
            if question_type not in allowed_types:
                logger.info("QuizGenerator dropped question due to invalid type: %s", question.get("question_type"))
                continue

            question_text = _normalize_whitespace(str(question.get("question_text", "")))
            correct_answer = _normalize_whitespace(str(question.get("correct_answer", "")))
            explanation = _normalize_whitespace(str(question.get("explanation", "")))

            if not question_text or not correct_answer:
                logger.info("QuizGenerator dropped question due to missing text/answer")
                continue

            options = question.get("options")
            normalized_options: List[str] | None = None
            raw_source_index = question.get("source_index")
            try:
                source_index = int(raw_source_index)
            except (TypeError, ValueError):
                source_index = 1

            if source_index < 1 or source_index > max_source_index:
                logger.info(
                    "QuizGenerator adjusted source index %s to range 1..%s",
                    raw_source_index,
                    max_source_index,
                )
                source_index = max(1, min(max_source_index, source_index))

            if question_type == "mcq":
                if not isinstance(options, list):
                    logger.info("QuizGenerator dropped mcq due to non-list options")
                    continue
                normalized_options = [
                    _coerce_option(option)
                    for option in options
                    if _coerce_option(option)
                ]
                deduped: List[str] = []
                for option in normalized_options:
                    if option not in deduped:
                        deduped.append(option)
                normalized_options = deduped[:4]
                if len(normalized_options) < 4:
                    logger.info("QuizGenerator dropped mcq due to insufficient options: %s", len(normalized_options))
                    continue

                if correct_answer.upper() in {"A", "B", "C", "D"}:
                    index = ord(correct_answer.upper()) - ord("A")
                    correct_answer = normalized_options[index]
                else:
                    letter_match = re.match(r"^([A-D])[\).\:-]?\s*(.*)$", correct_answer, flags=re.IGNORECASE)
                    if letter_match:
                        index = ord(letter_match.group(1).upper()) - ord("A")
                        correct_answer = normalized_options[index]

                if correct_answer not in normalized_options:
                    stripped_match = None
                    for option in normalized_options:
                        if correct_answer.lower() in option.lower() or option.lower() in correct_answer.lower():
                            stripped_match = option
                            break
                    if stripped_match:
                        correct_answer = stripped_match
                    else:
                        logger.info("QuizGenerator dropped mcq due to answer mismatch")
                        continue

            elif question_type == "true_false":
                normalized_options = ["True", "False"]
                if correct_answer.lower() not in {"true", "false"}:
                    logger.info("QuizGenerator dropped true_false due to invalid answer")
                    continue
                correct_answer = correct_answer.capitalize()

            elif question_type == "fill_blank":
                if "____" not in question_text and "blank" not in question_text.lower():
                    logger.info("QuizGenerator dropped fill_blank due to missing blank marker")
                    continue

            elif question_type == "short":
                normalized_options = None

            cleaned.append(
                {
                    "question_text": question_text,
                    "question_type": question_type,
                    "options": normalized_options,
                    "correct_answer": correct_answer,
                    "explanation": explanation or "Review the source passage for the supporting detail.",
                    "source_index": source_index,
                }
            )

        logger.info("QuizGenerator sanitized %s/%s questions", len(cleaned), len(questions))
        return cleaned

    def _normalize_question_type(self, value: Any) -> str:
        normalized = _normalize_whitespace(str(value)).lower().replace("_", " ")
        return self.QUESTION_TYPE_ALIASES.get(normalized, normalized.replace(" ", "_"))


quiz_generator = QuizGenerator()
