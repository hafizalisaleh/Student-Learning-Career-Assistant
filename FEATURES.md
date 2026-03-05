# SLCA — Feature Roadmap & Architecture

## Completed Features

| Feature | Description |
|---|---|
| User Auth & Security | JWT sessions, bcrypt hashing, registration, login, email verification, profile management |
| Document Upload & Processing | PDF, DOCX, PPTX, TXT, MD, CSV, XLSX, JPG, PNG, YouTube, web URLs — extraction, chunking, ChromaDB embedding, thumbnail generation |
| PDF Viewer + AI Workspace | Split-pane layout (react-resizable-panels): PDF with text selection → AI chat with RAG context + study notes tab |
| AI Note Generation | Three types (structured/bullet/detailed) via Gemini, markdown with LaTeX, per-document |
| Study Notes (BlockNote) | Rich block editor (BlockNote v0.47), debounced auto-save (1.5s), markdown/PDF/DOCX export |
| Summary Generation | Three lengths (concise/standard/in-depth), typing animation, copy to clipboard, export |
| Mind Map Generation | Mermaid-based, 3 styles (simple/default/detailed), SVG zoom (50–200%) + download |
| Diagram Generation | 5 types: flowchart, sequence, ER, state, class — Mermaid rendering with caching |
| Quiz Generation & Taking | MCQ, true/false, short answer, fill-blank — scoring, per-question feedback, difficulty levels |
| Quiz Analytics | Per-topic performance, strong/weak topic detection, accuracy trends, total attempts |
| RAG Chat (3 Modes) | Structured output (ChromaDB), file search with API grounding, NLI verification with fact-checking |
| Inline Citations | `[N]` badges → clickable, scroll to source cards with page references, mode-aware metadata |
| Real-Time Voice Chat | WebSocket + Gemini Live API (Aoede voice), bidirectional audio, document-aware RAG context |
| Knowledge Graph | Mind-elixir visualization, node-click → AI Explorer sliding panel with RAG-powered chat |
| Career Module | Resume upload (PDF/DOC/DOCX), ATS analysis, role recommendations with match %, skill gaps, learning paths, certifications |
| Interview Prep | Common questions, STAR method framework, role-specific questions, practice mode (full-screen one-at-a-time) |
| Progress Dashboard | Study streak, avg quiz score, activity charts (Recharts), AI insights (priority-based), topic trends with arrows |
| Content Revision | Prompt-based revision bars on mind maps, diagrams, and summaries with undo history (backend also supports notes) |
| Dark/Light Theme | CSS variable-based design system with ThemeToggle, feature-specific colors |
| UI Component Library | Button, Card, Input, Select, Badge, EmptyState, LoadingSpinner, Breadcrumb, CitedMarkdown, MindMap, PromptInput, ChatContainer, etc. |

---

## Part 1: Competitor-Inspired Features

### 1. Prompt-Based Revision on Any Output

**Competitor:** NotebookLM (Feb 2026 — "make slide 3 more visual")
**Status:** Done (mind maps, diagrams, summaries)
**Remaining:** Add revision bar to note detail page UI

**How to build the remaining piece:**
- Frontend: Add the same revision input bar (Wand2 icon + text input + Send button + undo) to the note detail page at `/dashboard/notes/[id]`
- Backend: Already supports `content_type: 'note'` on `POST /api/vectors/revise`
- Wire up undo history stack identical to the diagram/mind map implementation

---

### 2. Inline Feynman-Style Tutor Inside BlockNote Editor

**Competitor:** Opennote.com
**Status:** Not started — BlockEditor has two slash-menu stubs (`/ai-summary`, `/ai-quiz`) that insert placeholder text but make no API calls

**How to build:**
- **Frontend:** Add a selection listener to BlockEditor. When text is selected, show a floating toolbar positioned via `window.getSelection().getRangeAt(0).getBoundingClientRect()` with buttons: "Explain Simply", "Socratic Question", "Why does this matter?"
- **Backend:** New endpoint `POST /api/notes/explain` accepting `selected_text`, `surrounding_context`, and `mode` (feynman/socratic/elaborate). Gemini prompt includes system instruction for Feynman-style teaching — simple analogies, Socratic questioning instead of direct answers.
- **UI:** Response appears in a sliding panel or inline popover below the selection. Option to insert the explanation directly into the note.

---

### 3. Bi-Directional Auto-Linking + Knowledge Graph

**Competitor:** Obsidian
**Status:** ~60% done — backend graph API returns full node/link data, frontend renders mind-elixir tree with AI Explorer panel

**What's missing:**
- No force-directed graph visualization
- No `[[concept]]` auto-linking within note content
- No bidirectional links between notes
- Topic matching is case-normalized string matching, not semantic

**How to build the rest:**
- **Force graph:** Add a toggle on the Knowledge Graph page to switch between mind-elixir tree view and a force-directed graph view. Nodes are draggable, zoomable, cluster by topic.
- **Auto-linking:** Backend post-processing after note generation — scan note content for terms matching document `topics` and `keywords` already in the DB. Wrap matches in `[[concept]]` syntax. Frontend renders these as clickable links navigating to the knowledge graph filtered to that concept.
- **Bidirectional links table:** New DB table `concept_links(id, source_note_id, target_note_id, concept, created_at)` populated during note save.

---

### 4. One-Click "Turn This Note Section Into Explainer Video"

**Competitor:** Opennote (text-to-video pipeline)
**Status:** Not started — no video generation, TTS-for-content, or video tooling exists

**How to build:**
- **Backend:** New endpoint `POST /api/notes/video`. Takes a note section → Gemini generates narration script (short, conversational) → TTS API generates audio → Gemini generates simple slide descriptions → render as image frames (HTML canvas/SVG → PNG) → stitch audio + images into video using FFmpeg subprocess.
- **Frontend:** "Generate Video" button on note sections. Progress indicator during generation. Video player component for playback + download.
- **Note:** Heaviest feature — FFmpeg dependency, TTS costs, and generation time make it the most complex.

---

### 5. Autonomous "Study Agent" That Runs Nightly

**Competitor:** Notion 3.2 Custom Agents
**Status:** Not started — all generation is user-triggered. Building blocks exist (weak topic analytics via `GET /api/progress/performance`, quiz generation via `POST /api/quizzes/generate`).

**How to build:**
- **Backend:** Add APScheduler with a nightly cron job per user. Agent logic: (1) query weak_topics from progress analytics, (2) find documents related to those topics, (3) auto-generate flashcard-style quizzes targeting weak areas, (4) store results in a new `study_briefs` table.
- **DB:** New table `study_briefs(id, user_id, generated_at, brief_type, content JSONB, is_read)`.
- **Frontend:** "Morning Briefing" card on dashboard: "While you slept, I prepared 15 flashcards on Thermodynamics (your weakest topic)." Links directly to the generated quiz.

---

### 6. Canvas-Style Freeform Visual Workspace

**Competitor:** Obsidian Excalidraw + NotebookLM infographics
**Status:** Not started — workspace is structured split-pane only, mind maps render static Mermaid SVG

**How to build:**
- **Frontend:** Install Excalidraw React component. Add a "Canvas" tab on document detail page alongside Mind Map and Diagrams. Pre-populate canvas with Mermaid mind map converted to Excalidraw elements.
- **Backend:** New endpoint `PUT /api/documents/{id}/canvas` to persist Excalidraw JSON scene.
- **DB:** Add `canvas_data JSONB` column to documents table or a separate `canvases` table.

---

## Part 2: Truly Unique Features

### 7. Knowledge Evolution Timeline

**Status:** ~25% — timestamps on notes/quizzes exist, topic extraction per document exists, but no version history, no semantic concept matching, no evolution tracking

> Full architecture in [Deep Dive](#deep-dive-knowledge-evolution-timeline) below.

---

### 8. Misconception Radar

**Status:** Not started — quiz answer data exists at question-level (JSONB with `is_correct`, `user_answer`, `correct_answer`), but no misconception database

**How to build:**
- **Misconception DB:** Curate a JSON file or small ChromaDB collection of ~500 common misconceptions per subject (e.g., "Plants get food from soil" → correct: "Plants make food via photosynthesis"). Embed each misconception.
- **Backend:** New endpoint `POST /api/notes/scan-misconceptions`. Takes note content → embed key claims → cosine similarity against misconception DB → return matches above threshold. Also run after quiz submissions: compare wrong answers against misconception patterns.
- **Frontend:** Non-intrusive banner or sidebar panel on note detail: "Heads up — this section might contain a common misconception." Expandable card with the correction + link to the source page in their document.
- **Trigger:** Run automatically after note generation and on quiz review page.

---

### 9. Cross-Domain Analogy Engine

**Status:** ~20% — RAG infrastructure + multi-doc embeddings exist, documents already have `domains` field extracted and stored

**How to build:**
- **Backend:** New endpoint `POST /api/vectors/analogy`. Takes `concept` + `target_domain` (e.g., "biology"). Pipeline: (1) retrieve user's embeddings from target domain docs, (2) retrieve embeddings about the source concept, (3) prompt Gemini: "Using ONLY concepts from these biology notes: [retrieved chunks], create an analogy that explains [concept]. Do not use any generic examples — only the student's own material."
- **Frontend:** Button in the Ask page or note detail: "Explain using my [dropdown: Biology/History/CS/...] notes." Dropdown auto-populated from user's document `domains` field (already extracted and stored in documents table JSONB).
- **Key:** Mostly prompt engineering on top of existing RAG infrastructure.

---

### 10. Mock Exam + Performance Predictor

**Status:** ~30% — quiz generation + weak topic analytics exist, per-question answer storage exists in `quiz_attempts.answers` JSONB

**How to build:**
- **Backend:**
  - New endpoint `POST /api/quizzes/mock-exam`. Accepts multiple document IDs + total question count + time limit. Generates questions weighted toward weak topics (from `GET /api/progress/performance`). Returns `mock_exam` object with timer metadata.
  - Prediction endpoint `POST /api/quizzes/mock-exam/{id}/predict`: compare error profile (topics wrong, question types failed) against historical data. Simple regression: `predicted_score = weighted_avg(topic_scores) * difficulty_adjustment`.
- **DB:** New table `mock_exams(id, user_id, document_ids JSONB, time_limit, questions JSONB, attempt JSONB, predicted_score, actual_score, created_at)`.
- **Frontend:** New "Mock Exam" page with timer bar, question navigation sidebar, submit. Results page shows breakdown + predicted real exam score with confidence interval. Over time, show prediction accuracy graph.
- **FYP angle:** Run a real user study measuring prediction accuracy.

---

### 11. Offline-First + Local LLM Fallback

**Status:** Not started — zero PWA infrastructure (no manifest.json, no service worker, no next-pwa)

**How to build:**
- **Frontend:**
  - Add `next-pwa` wrapper → generates service worker + manifest
  - Cache critical routes and static assets via workbox strategies
  - Use IndexedDB (via `idb` library) to store documents, notes, quiz data locally
  - Sync engine: on reconnect, diff local changes against server timestamps, push/pull
  - Local LLM: Integrate WebLLM (runs small models like Phi-3 Mini in-browser via WebGPU). When offline, route AI requests to local model with a "Local AI — limited capability" badge
- **Backend:** New sync endpoints `POST /api/sync/push` and `GET /api/sync/pull?since=timestamp`.
- **Note:** Architecturally the most invasive — touches every page's data fetching.

---

### 12. Study Group AI Mediator (Anonymous)

**Status:** Not started — strictly single-user, no social DB schema, no user-to-user relationships

**How to build:**
- **DB:** New tables: `study_groups(id, name, topic, created_at)`, `group_members(group_id, user_id, role, strengths JSONB, weaknesses JSONB)`, `group_messages(id, group_id, sender_id, content, is_ai_mediation BOOL, created_at)`.
- **Backend:**
  - Matching endpoint `POST /api/groups/match`: query each user's weak/strong topics → pair complementary users. Opt-in only, anonymized display names.
  - WebSocket group chat. AI mediator runs as background participant: after every N messages, Gemini analyzes conversation and injects suggestions.
  - Privacy: users share only anonymized topic strengths, never raw notes/documents.
- **Frontend:** New `/dashboard/study-groups` page with group list, real-time chat, AI mediator messages styled distinctly.

---

### 13. LaTeX Equation Live Solver + Verification

**Status:** ~15% — KaTeX renders LaTeX in frontend (react-katex + remark-math + rehype-katex), sympy exists in venv as transitive dependency but is unused by app code

**How to build:**
- **Backend:**
  - Add `sympy` to requirements.txt (already available as transitive dep)
  - New endpoint `POST /api/documents/solve-equation`. Takes LaTeX string → parse with sympy `parse_latex` → solve/simplify → return step-by-step solution + final answer.
  - Verification endpoint `POST /api/documents/verify-equation`. Takes user's derived equation + source page reference → extract equation from that page → compare symbolically via `simplify(eq1 - eq2) == 0`.
- **Frontend:**
  - Equation detection: scan rendered content for `$...$` and `$$...$$` blocks. Wrap each in a clickable component.
  - On click: equation panel with editable LaTeX input, "Solve", "Simplify", and "Verify against source" buttons.
  - Results show step-by-step symbolic work + verification badge.

---

### 14. Cognitive Load Monitor (Experimental)

**Status:** ~10% — `activity_logs` table exists (though only career events are currently logged), `time_taken` on quiz attempts exists

**How to build:**
- **Frontend:**
  - Client-side tracker module: record time-on-page, scroll speed, mouse idle time, quiz response time per question, error streaks (3+ wrong in a row).
  - Heuristic scoring: `load_score = f(time_on_page, error_rate, idle_pauses)`. Threshold: >80 = overloaded.
  - When overloaded: toast notification: "You've been studying for 45 min with declining accuracy. Take a 5-min break?" Options: "Simplify this section" (calls revision endpoint) or "Quick break" (timer + fun fact).
  - Send tracking data to backend periodically.
- **Backend:**
  - New table `cognitive_metrics(id, user_id, session_id, page, load_score, metrics JSONB, timestamp)`.
  - Endpoint `POST /api/progress/cognitive-metrics` to store data.
  - `GET /api/progress/cognitive-insights` to analyze patterns: "You study best between 9-11 AM" or "Your accuracy drops after 40 min consistently."
- **Research angle:** Log all metrics → export CSV for thesis. Cite Sweller's Cognitive Load Theory.

---

## Deep Dive: Knowledge Evolution Timeline

### The Problem

No existing tool tracks **personal conceptual growth over time**. The user should see: "You understood photosynthesis at Level 2 in January → Level 4 now. Here's what changed."

Three critical design challenges:
1. How does level progress when new PDFs are uploaded but no notes/quizzes are created on them?
2. How does the AI decide that "Gradient Descent" relates to "Linear Regression" and not to "Photosynthesis"?
3. What happens when there's minimal input (few notes, no quizzes)?

---

### Architecture Overview

```
Document Upload
      |
      v
Topic Extraction (Gemini) --> Raw concepts: ["Convolution", "Feature Maps", ...]
      |
      v
Concept Matcher --> Embed each concept --> Query slca_concepts collection
      |                                          |
      |                    +---------------------+
      |                    |                     |
      v                    v                     v
Similarity > 0.92    0.82 - 0.92          < 0.82
= MERGE as alias     = NEW concept +      = Unrelated
                       relationship link
      |                    |
      v                    v
document_concept_links (with depth_score)
      |
      v
Level Calculation (6 signals) --> concept_snapshots (timeline point)
      |
      v
user_concept_state (current level, fast reads)
```

---

### Concept Matching: Two-Tier Embedding Similarity

When a document is uploaded and topic extraction completes, each extracted concept (from `topics` + `concepts` + `technical_skills` fields returned by Gemini) is embedded using `gemini-embedding-001` (768 dims) and compared against the `slca_concepts` ChromaDB collection.

**Tier 1 — Merge (similarity > 0.92):**
The raw concept is an alias of an existing canonical concept. Example: "Convolution" from a DIP PDF and "Convolution Operations" from a CNN PDF → same concept. The alias is added to the canonical concept's `aliases` JSONB array.

**Tier 2 — Link as Related (similarity 0.82-0.92):**
The concept is distinct but related. Example: "Linear Regression" (0.86 similarity with "Logistic Regression") → both exist as separate canonical concepts, but a `concept_relationships` entry is created linking them.

**Below 0.82:** Unrelated concepts. No link created.

**Concept Hierarchy Refinement:** Periodically (daily batch), a Gemini call organizes accumulated concepts into a parent-child hierarchy:
```
Prompt: Given these concepts from a student's documents: [list]
Organize them into a hierarchy where broader concepts are parents of narrower ones.
Return JSON: {"relationships": [{"parent": "Machine Learning", "child": "Neural Networks", "type": "parent_child"}, ...]}
```

---

### Level Formula (Multi-Signal Scoring)

```
raw_score = (exposure * 0.15) + (depth * 0.25) + (notes * 0.20) + (quiz * 0.25) + (breadth * 0.10) + (recency * 0.05)
level = ceil(raw_score * 5)    // Maps 0.0-1.0 to levels 1-5
```

#### Signal 1: Exposure (weight 0.15)
How many documents contain this concept?
| Documents | Score |
|-----------|-------|
| 0 | 0.0 |
| 1 | 0.4 |
| 2 | 0.7 |
| 3+ | 1.0 |

#### Signal 2: Depth (weight 0.25)
How deeply does the content cover this concept? Measured by querying the document's chunks in ChromaDB for semantic similarity to the concept embedding.
```
depth_ratio = related_chunks / total_document_chunks
```
| Depth Ratio | Meaning | Score |
|-------------|---------|-------|
| < 0.05 | Brief mention | 0.2 |
| 0.05-0.15 | Moderate coverage | 0.5 |
| 0.15-0.30 | Significant coverage | 0.8 |
| > 0.30 | Primary topic | 1.0 |

Averaged across all documents containing the concept.

#### Signal 3: Notes (weight 0.20)
Notes related to this concept. Determined by embedding the note's content (first 2000 chars) and comparing against the concept's embedding in `slca_concepts` (similarity > 0.75 = related).
| Related Notes | Score |
|--------------|-------|
| 0 | 0.0 |
| 1 | 0.5 |
| 2 | 0.8 |
| 3+ | 1.0 |

#### Signal 4: Quiz (weight 0.25)
Quiz accuracy on related questions. Each question's text is embedded and compared against concept embeddings (similarity > 0.75 = tests this concept). Question-to-concept mappings are pre-computed at quiz submission time, not on every timeline request.
```
quiz_score = correct_related_questions / total_related_questions
```

#### Signal 5: Breadth (weight 0.10)
Does the concept appear across documents from different domains (using `documents.domains` JSONB)?
| Domains | Score |
|---------|-------|
| 1 | 0.3 |
| 2 | 0.6 |
| 3+ | 1.0 |

#### Signal 6: Recency (weight 0.05)
How recently the user engaged with this concept (most recent of: document upload, note creation, quiz attempt).
| Recency | Score |
|---------|-------|
| Within 7 days | 1.0 |
| 7-30 days | 0.7 |
| 30-90 days | 0.4 |
| 90+ days | 0.1 |

---

### Database Schema (5 New Tables)

**Table 1: `concepts`** — Canonical concept registry
```sql
CREATE TABLE concepts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name  VARCHAR(200) NOT NULL,
    aliases         JSONB DEFAULT '[]',
    embedding_id    VARCHAR(255),          -- ID in slca_concepts ChromaDB collection
    domain          VARCHAR(200),
    parent_concept_id UUID REFERENCES concepts(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Table 2: `document_concept_links`** — Which documents contain which concepts
```sql
CREATE TABLE document_concept_links (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    concept_id        UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    similarity_score  FLOAT,
    depth_score       FLOAT,
    raw_concept_text  VARCHAR(200),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, concept_id)
);
```

**Table 3: `concept_snapshots`** — Timeline data points
```sql
CREATE TABLE concept_snapshots (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    concept_id        UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    level             INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
    raw_score         FLOAT NOT NULL,
    signal_breakdown  JSONB NOT NULL,
    document_count    INTEGER DEFAULT 0,
    note_count        INTEGER DEFAULT 0,
    quiz_accuracy     FLOAT,
    snapshot_trigger  VARCHAR(50),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_snapshots_user_concept_time ON concept_snapshots(user_id, concept_id, created_at);
```

**Table 4: `concept_relationships`** — Hierarchy and connections
```sql
CREATE TABLE concept_relationships (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_concept_id   UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    child_concept_id    UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    relationship_type   VARCHAR(50) DEFAULT 'parent_child',
    strength            FLOAT DEFAULT 0.5,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_concept_id, child_concept_id, relationship_type)
);
```

**Table 5: `user_concept_state`** — Current denormalized state (fast reads)
```sql
CREATE TABLE user_concept_state (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    concept_id        UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    current_level     INTEGER NOT NULL DEFAULT 1,
    current_raw_score FLOAT NOT NULL DEFAULT 0.0,
    current_signals   JSONB,
    first_seen_at     TIMESTAMPTZ,
    last_updated_at   TIMESTAMPTZ DEFAULT NOW(),
    pending_snapshot  BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, concept_id)
);
```

---

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/evolution/timeline` | Timeline of concept level changes (filterable by concept_id, since date, limit) |
| GET | `/api/evolution/concepts` | List all concepts with current levels (filterable by domain, min_level, sortable) |
| GET | `/api/evolution/concepts/{id}` | Detailed single concept: full signal breakdown, related docs, notes, quiz performance |
| POST | `/api/evolution/recalculate` | Force recalculation of all concept levels for current user |
| GET | `/api/evolution/graph` | Concept relationship graph (nodes + links format matching existing knowledge-graph endpoint) |
| GET | `/api/evolution/domain-summary` | Aggregate levels by domain for radar/overview chart |

---

### Snapshot Triggers

| Event | What Happens |
|-------|-------------|
| Document upload (after topic extraction) | Concepts extracted → matched/merged → linked. Levels recalculated for affected concepts. |
| Quiz attempt submission | Question-to-concept mappings computed. Quiz signal updated. Snapshot for affected concepts. |
| Note creation/update | Note content embedded → matched to concepts. Note signal updated. Snapshot taken. |
| Daily batch (cron) | Recency decay applied. Concept hierarchy refreshed via Gemini. All levels recalculated. |

Snapshots are debounced: within a burst of events (e.g., 3 PDFs uploaded in 5 minutes), a `pending_snapshot` flag is set on `user_concept_state` and a background task consolidates into one snapshot per 60 seconds.

---

### Edge Case 1: DIP → YOLO → CNN (No Notes/Quizzes on New PDFs)

**Step 1:** User uploads "Digital Image Processing" PDF.
- Topic extraction returns: `["Digital Image Processing", "Convolution", "Edge Detection", "Image Filtering"]` + concepts: `["Spatial Filtering", "Frequency Domain", "Fourier Transform"]`
- All 7 are new → 7 canonical concepts created, embedded in `slca_concepts`
- `document_concept_links` created with depth scores
- Snapshot: all at level 1 (exposure=0.4, depth varies, notes=0, quiz=0, breadth=0.3, recency=1.0)

**Step 2:** User creates notes on DIP.
- Note content embedded → compared to 7 concept embeddings → matches found for "Convolution", "Edge Detection", etc.
- "Convolution" note_score: 0.0 → 0.5
- Snapshot: "Convolution" rises to level 2

**Step 3:** User takes quiz on DIP, scores 80% on convolution questions.
- Quiz questions embedded → matched to concepts → "Convolution" quiz_score = 0.8
- Combined: exposure=0.4 + depth=0.5 + notes=0.5 + quiz=0.8 + breadth=0.3 + recency=1.0
- raw_score = 0.52 → **level 3**

**Step 4:** User uploads "YOLO" PDF (no notes, no quiz created).
- Topic extraction: `["YOLO", "Object Detection"]` + concepts: `["Convolution", "Feature Extraction", "Non-Max Suppression"]`
- "Convolution" embedded → query `slca_concepts` → similarity 0.95 with existing → **MERGED** (Tier 1)
- New `document_concept_links` entry for YOLO → Convolution
- "Convolution" now in 2 documents → exposure: 0.4 → 0.7
- **Level rises to 3-4 even though user wrote zero notes and took zero quizzes on YOLO**

**Step 5:** User uploads "CNN" PDF (no notes, no quiz created).
- "Convolution" extracted again → merged at 0.98
- "Convolutional Neural Networks" extracted → similarity 0.86 with "Convolution" → **Tier 2: separate concept + relationship link**
- "Convolution" now in 3 docs → exposure = 1.0, breadth may increase
- **"Convolution" reaches level 4** purely from document uploads

---

### Edge Case 2: Linear Regression → Gradient Descent → Logistic Regression

**Step 1:** User has a statistics PDF. "Linear Regression" exists as a canonical concept at level 2.

**Step 2:** User uploads a "Gradient Descent" document.
- Extracted concepts include "Gradient Descent", "Optimization", "Learning Rate", "Cost Function", and "Linear Regression" (mentioned as a use case in the document text).
- "Linear Regression" from this doc → similarity 0.97 with existing canonical → **MERGED**. Exposure for "Linear Regression" increases (now 2 docs).
- "Gradient Descent" is new → created as separate canonical concept at level 1.
- Periodic Gemini hierarchy call identifies: "Gradient Descent" is a technique used by "Linear Regression" → `concept_relationships` entry: `{parent: "Linear Regression", child: "Gradient Descent", type: "prerequisite"}`.

**Step 3:** User uploads a "Logistic Regression" document.
- "Logistic Regression" embedded → similarity with "Linear Regression" = ~0.86 → **Tier 2: separate concept + relationship link as siblings**
- Both exist as independent concepts. The relationship link type = "related".
- Periodic hierarchy call creates: "Regression Methods" as parent → `{Linear Regression, Logistic Regression}` as children, "Gradient Descent" as prerequisite of both.
- Timeline shows: "Linear Regression" level increases (more exposure/breadth), "Logistic Regression" starts at level 1 independently, "Gradient Descent" linked as prerequisite to both.

**Key:** The system uses **embedding similarity** (not string matching) to determine that "Gradient Descent" relates to "Linear Regression" — their embeddings are close in the 768-dimensional space because they co-occur heavily in ML literature. "Photosynthesis" would be nowhere near either in embedding space.

---

### Edge Case 3: Low Input Context (Few Notes, No Quizzes)

**Scenario:** User has 3 uploaded documents, 1 note, 0 quizzes.

**Why it still works — the formula doesn't require all signals:**

For a concept appearing in 2 of the 3 docs with moderate depth, plus the 1 note relates:
```
exposure = 0.7  (2 docs)
depth    = 0.5  (moderate coverage)
notes    = 0.5  (1 related note)
quiz     = 0.0  (no quizzes taken)
breadth  = 0.3  (1 domain)
recency  = 1.0  (recent upload)

raw_score = (0.7 x 0.15) + (0.5 x 0.25) + (0.5 x 0.20) + (0.0 x 0.25) + (0.3 x 0.10) + (1.0 x 0.05)
          = 0.105 + 0.125 + 0.10 + 0 + 0.03 + 0.05
          = 0.41 → ceil(0.41 x 5) = ceil(2.05) = level 3
```

**Depth is the key differentiator in low-input scenarios.** A document that mentions "Neural Networks" in 1 paragraph (depth=0.2) vs. a dedicated textbook chapter (depth=1.0) produces very different levels. The system infers understanding potential from content depth alone — no user action required beyond uploading the document.

**The UI turns missing signals into recommendations:**
The signal breakdown is shown to the user. If notes=0 and quiz=0, the frontend displays:
> "Level 2 — based on document exposure. Take a quiz or write notes to deepen your understanding!"

This turns the "low input" problem into a **recommendation opportunity** rather than a limitation.

---

### Implementation Phases

**Phase 1 — Foundation:** DB migration (5 tables) + concept matching service + second ChromaDB collection (`slca_concepts`)

**Phase 2 — Upload Integration:** Hook concept matching into `process_document_background()` in `documents/views.py` after topic extraction completes. Compute depth scores from existing chunk data. Take initial snapshots.

**Phase 3 — Quiz & Note Integration:** Add snapshot triggers to quiz submission handler in `quizzes/views.py` and note creation/update handler in `notes/views.py`. Implement note-to-concept and question-to-concept matching via embedding comparison.

**Phase 4 — API & Frontend:** Build the 6 API endpoints under new `knowledge_evolution/` module. Create timeline visualization component. Integrate with progress page or as new `/dashboard/evolution` page.

**Phase 5 — Refinement:** Daily cron for recency decay + hierarchy refresh. Debounced snapshot mechanism. Backfill concept extraction on all existing documents.
