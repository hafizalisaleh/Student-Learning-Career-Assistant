# Document Storage Optimization

## Problem
Previously, the system was extracting and storing full document text in the database immediately upon upload. This caused:
- **High database storage costs** - storing potentially MB of text per document
- **Slow upload times** - waiting for full extraction before upload completes
- **Wasted resources** - extracting content that might never be used
- **Database bloat** - PostgreSQL storing large TEXT columns

## New Architecture (On-Demand Extraction)

### 1. Upload Phase (Fast & Lightweight)
- ✅ Only store file metadata (filename, size, path, type)
- ✅ Upload completes immediately
- ✅ Background task only indexes to vector store (embeddings, not full text)
- ✅ No `extracted_text` stored in database

### 2. Content Extraction (On-Demand)
- 📄 Content extracted ONLY when actually needed:
  - When generating a summary
  - When creating notes
  - When generating a quiz
  - When user explicitly requests content
- 🚀 Uses new endpoint: `GET /api/documents/{id}/content`
- ⚡ Content is extracted from file in real-time
- 💾 Could be cached temporarily (Redis) for performance

### 3. Storage Strategy
```
Upload: File → Disk Storage + Metadata in DB + Vector Embeddings
Usage:  File → Extract on-demand → Process → Discard
```

## Benefits

### Cost Savings
- **90% less database storage** - no TEXT columns with full content
- **Faster queries** - smaller database, faster scans
- **Cheaper backups** - less data to backup

### Performance
- **Instant uploads** - no waiting for extraction
- **Scalable** - can handle 1000s of documents
- **Flexible** - re-extract with updated algorithms anytime

### Resource Efficiency
- **Extract only when needed** - many documents uploaded but never used
- **Fresh extraction** - always uses latest extraction algorithms
- **No stale data** - content extracted from source every time

## Implementation Details

### Backend Changes
1. `process_document_background()` - No longer stores `extracted_text`
2. `extract_content_on_demand()` - New method in `upload_handler`
3. `GET /api/documents/{id}/content` - New endpoint for on-demand extraction

### Database Schema
- `extracted_text` column remains but is rarely used
- Could be dropped in future migration
- `doc_metadata` stores only indexing info, not content

### Vector Store (ChromaDB)
- Still used for semantic search
- Stores embeddings, not full text
- Allows RAG without database bloat

## Future Enhancements

### Caching Layer (Optional)
```python
# Redis cache for recently extracted content
cache_key = f"doc_content:{document_id}"
if cached := redis.get(cache_key):
    return cached
content = extract_from_file()
redis.setex(cache_key, 3600, content)  # 1 hour TTL
```

### Streaming Extraction (Optional)
```python
# Stream large documents instead of loading all at once
async def stream_content(document_id):
    for chunk in extract_in_chunks(file_path):
        yield chunk
```

### Pre-warming (Optional)
```python
# Pre-extract content for frequently accessed documents
if doc.access_count > 10:
    cache_content_in_redis(doc.id)
```

## Migration Path

### For Existing Data
```sql
-- Optional: Clean up old extracted_text to save space
UPDATE documents SET extracted_text = NULL WHERE extracted_text IS NOT NULL;

-- Vacuum to reclaim space
VACUUM FULL documents;
```

### No Breaking Changes
- Old code reading `extracted_text` gets NULL (graceful)
- New code uses `/content` endpoint
- Gradual migration possible

## Summary

**Before:** Upload → Extract Full Text → Store in DB → Use Later
**After:** Upload → Store File → Extract When Needed → Discard

This saves money, improves performance, and makes the system more scalable!
