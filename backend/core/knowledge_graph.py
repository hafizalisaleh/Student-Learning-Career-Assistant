"""
Knowledge Graph builder — extracts concepts from documents/notes and
computes similarity links using existing ChromaDB embeddings.
"""
from typing import Dict, Any, List
from utils.gemini_client import gemini_client
from utils.logger import logger


def build_knowledge_graph(
    documents: List[Dict[str, Any]],
    notes: List[Dict[str, Any]],
    chunks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Build a knowledge graph from user's documents, notes, and vector chunks.

    Returns graph data in {nodes: [...], links: [...]} format for react-force-graph.
    """
    nodes = []
    links = []
    node_ids = set()

    # --- 1. Document nodes ---
    for doc in documents:
        doc_id = f"doc-{doc['id']}"
        nodes.append({
            "id": doc_id,
            "label": _truncate(doc.get("title", "Untitled"), 30),
            "type": "document",
            "group": "document",
            "size": 12,
            "metadata": {
                "content_type": doc.get("content_type"),
                "topics": doc.get("topics", []),
            },
        })
        node_ids.add(doc_id)

    # --- 2. Topic nodes (from document metadata) ---
    topic_to_docs: Dict[str, List[str]] = {}
    for doc in documents:
        doc_id = f"doc-{doc['id']}"
        for topic in (doc.get("topics") or []):
            topic_clean = topic.strip().lower()
            if not topic_clean:
                continue
            topic_id = f"topic-{topic_clean.replace(' ', '_')}"
            if topic_id not in node_ids:
                nodes.append({
                    "id": topic_id,
                    "label": topic.strip().title(),
                    "type": "topic",
                    "group": "topic",
                    "size": 8,
                    "metadata": {},
                })
                node_ids.add(topic_id)

            topic_to_docs.setdefault(topic_id, []).append(doc_id)
            links.append({
                "source": doc_id,
                "target": topic_id,
                "type": "has_topic",
                "strength": 0.6,
            })

    # --- 3. Keyword nodes ---
    keyword_to_docs: Dict[str, List[str]] = {}
    for doc in documents:
        doc_id = f"doc-{doc['id']}"
        for kw in (doc.get("keywords") or [])[:10]:
            kw_clean = kw.strip().lower()
            if not kw_clean or len(kw_clean) < 3:
                continue
            kw_id = f"kw-{kw_clean.replace(' ', '_')}"
            if kw_id not in node_ids:
                nodes.append({
                    "id": kw_id,
                    "label": kw.strip(),
                    "type": "keyword",
                    "group": "keyword",
                    "size": 5,
                })
                node_ids.add(kw_id)

            keyword_to_docs.setdefault(kw_id, []).append(doc_id)
            links.append({
                "source": doc_id,
                "target": kw_id,
                "type": "has_keyword",
                "strength": 0.3,
            })

    # --- 4. Note nodes ---
    for note in notes:
        note_id = f"note-{note['id']}"
        doc_id = f"doc-{note.get('document_id', '')}"
        nodes.append({
            "id": note_id,
            "label": _truncate(note.get("title", "Untitled Note"), 25),
            "type": "note",
            "group": "note",
            "size": 7,
            "metadata": {
                "note_type": note.get("note_type"),
            },
        })
        node_ids.add(note_id)

        if doc_id in node_ids:
            links.append({
                "source": doc_id,
                "target": note_id,
                "type": "has_note",
                "strength": 0.8,
            })

    # --- 5. Enrich topic nodes with doc count ---
    for node in nodes:
        if node["type"] == "topic":
            doc_ids = topic_to_docs.get(node["id"], [])
            node["metadata"]["doc_count"] = len(doc_ids)

    # --- 6. Cross-document links via shared topics ---
    for topic_id, doc_ids in topic_to_docs.items():
        if len(doc_ids) > 1:
            for i in range(len(doc_ids)):
                for j in range(i + 1, len(doc_ids)):
                    links.append({
                        "source": doc_ids[i],
                        "target": doc_ids[j],
                        "type": "shared_topic",
                        "via": topic_id,
                        "strength": 0.4,
                    })

    # Deduplicate links
    seen_links = set()
    unique_links = []
    for link in links:
        key = f"{link['source']}-{link['target']}-{link['type']}"
        rev_key = f"{link['target']}-{link['source']}-{link['type']}"
        if key not in seen_links and rev_key not in seen_links:
            seen_links.add(key)
            unique_links.append(link)

    logger.info(
        f"Knowledge graph built: {len(nodes)} nodes, {len(unique_links)} links"
    )

    return {
        "nodes": nodes,
        "links": unique_links,
        "stats": {
            "documents": sum(1 for n in nodes if n["type"] == "document"),
            "topics": sum(1 for n in nodes if n["type"] == "topic"),
            "keywords": sum(1 for n in nodes if n["type"] == "keyword"),
            "notes": sum(1 for n in nodes if n["type"] == "note"),
            "total_links": len(unique_links),
        },
    }


def _truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"
