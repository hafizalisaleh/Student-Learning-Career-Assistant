"""
Gemini File Search Store Manager - Manages Google's managed RAG
for the File Search Tool citation mode.
"""
import os
import time
from typing import Dict, Any, Optional, List
from google import genai
from google.genai import types
from config.settings import settings
from utils.logger import logger


class FileSearchManager:
    """Manages Gemini File Search stores for document-level RAG with grounding metadata"""

    def __init__(self):
        self.api_key = os.getenv('GOOGLE_API_KEY')
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = None
        self.model_id = settings.GEMINI_MODEL
        # Cache: document_id -> file_search_store_name
        self._store_cache: Dict[str, str] = {}

    def _get_store_name(self, document_id: str) -> str:
        """Generate a consistent store name for a document"""
        safe_id = document_id.replace("-", "")[:20]
        return f"slca-doc-{safe_id}"

    def get_or_create_store(self, document_id: str) -> Optional[str]:
        """
        Get existing file search store for a document, or return None if not found.

        Returns:
            File search store resource name, or None
        """
        if document_id in self._store_cache:
            return self._store_cache[document_id]

        if not self.client:
            logger.error("Google API Key not configured")
            return None

        try:
            # Try to find existing store by listing
            stores = self.client.file_search_stores.list()
            display_name = self._get_store_name(document_id)
            for store in stores:
                if store.display_name == display_name:
                    self._store_cache[document_id] = store.name
                    logger.info(f"Found existing file search store: {store.name}")
                    return store.name
        except Exception as e:
            logger.error(f"Error listing file search stores: {e}")

        return None

    def create_store_and_upload(
        self,
        document_id: str,
        file_path: str,
        display_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a file search store and upload a document to it.

        Args:
            document_id: Internal document ID
            file_path: Path to the file to upload
            display_name: Optional display name for the file

        Returns:
            Dict with store name and status
        """
        if not self.client:
            return {"success": False, "error": "Google API Key not configured"}

        try:
            store_display = self._get_store_name(document_id)

            # Check if store already exists
            existing = self.get_or_create_store(document_id)
            if existing:
                return {
                    "success": True,
                    "store_name": existing,
                    "already_existed": True
                }

            # Create new store
            file_search_store = self.client.file_search_stores.create(
                config={'display_name': store_display}
            )
            logger.info(f"Created file search store: {file_search_store.name}")

            # Upload file to the store
            file_display = display_name or os.path.basename(file_path)
            operation = self.client.file_search_stores.upload_to_file_search_store(
                file=file_path,
                file_search_store_name=file_search_store.name,
                config={
                    'display_name': file_display,
                    'chunking_config': {
                        'white_space_config': {
                            'max_tokens_per_chunk': 256,
                            'max_overlap_tokens': 40
                        }
                    }
                }
            )

            # Wait for indexing to complete
            max_wait = 120  # seconds
            waited = 0
            while not operation.done and waited < max_wait:
                time.sleep(3)
                waited += 3
                operation = self.client.operations.get(operation)
                logger.info(f"File indexing in progress... ({waited}s)")

            if not operation.done:
                logger.warning(f"File indexing timed out after {max_wait}s")
                return {
                    "success": False,
                    "error": "File indexing timed out",
                    "store_name": file_search_store.name
                }

            self._store_cache[document_id] = file_search_store.name
            logger.info(f"File indexed successfully in store {file_search_store.name}")

            return {
                "success": True,
                "store_name": file_search_store.name,
                "already_existed": False
            }

        except Exception as e:
            logger.error(f"Error creating file search store: {e}")
            return {"success": False, "error": str(e)}

    def query_with_grounding(
        self,
        question: str,
        document_id: str,
    ) -> Dict[str, Any]:
        """
        Query using Gemini File Search with grounding metadata.
        Returns structured citations from groundingMetadata.

        Args:
            question: User's question
            document_id: Document ID whose store to query

        Returns:
            Dict with answer, grounding_chunks, grounding_supports
        """
        if not self.client:
            return {"success": False, "error": "Google API Key not configured"}

        store_name = self.get_or_create_store(document_id)
        if not store_name:
            return {
                "success": False,
                "error": "No file search store found for this document. Upload the document first."
            }

        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=question,
                config=types.GenerateContentConfig(
                    tools=[
                        types.Tool(
                            file_search=types.FileSearch(
                                file_search_store_names=[store_name]
                            )
                        )
                    ]
                )
            )

            # Extract grounding metadata
            candidate = response.candidates[0] if response.candidates else None
            grounding_metadata = None
            grounding_chunks = []
            grounding_supports = []

            if candidate and candidate.grounding_metadata:
                gm = candidate.grounding_metadata

                # Extract grounding chunks (sources)
                if gm.grounding_chunks:
                    for chunk in gm.grounding_chunks:
                        chunk_data = {}
                        if hasattr(chunk, 'web') and chunk.web:
                            chunk_data = {
                                "type": "web",
                                "uri": chunk.web.uri,
                                "title": chunk.web.title
                            }
                        elif hasattr(chunk, 'retrieved_context') and chunk.retrieved_context:
                            chunk_data = {
                                "type": "retrieved",
                                "uri": chunk.retrieved_context.uri if hasattr(chunk.retrieved_context, 'uri') else "",
                                "title": chunk.retrieved_context.title if hasattr(chunk.retrieved_context, 'title') else ""
                            }
                        grounding_chunks.append(chunk_data)

                # Extract grounding supports (segment -> chunk mappings)
                if gm.grounding_supports:
                    for support in gm.grounding_supports:
                        support_data = {
                            "segment": {
                                "start_index": support.segment.start_index if support.segment else 0,
                                "end_index": support.segment.end_index if support.segment else 0,
                                "text": support.segment.text if support.segment and hasattr(support.segment, 'text') else ""
                            },
                            "chunk_indices": list(support.grounding_chunk_indices) if support.grounding_chunk_indices else []
                        }
                        grounding_supports.append(support_data)

                grounding_metadata = {
                    "grounding_chunks": grounding_chunks,
                    "grounding_supports": grounding_supports,
                    "search_queries": list(gm.web_search_queries) if gm.web_search_queries else []
                }

            return {
                "success": True,
                "answer": response.text,
                "grounding_metadata": grounding_metadata,
                "grounding_chunks": grounding_chunks,
                "grounding_supports": grounding_supports
            }

        except Exception as e:
            logger.error(f"Error in file search query: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {"success": False, "error": str(e)}

    def delete_store(self, document_id: str) -> Dict[str, Any]:
        """Delete a file search store for a document"""
        if not self.client:
            return {"success": False, "error": "Google API Key not configured"}

        store_name = self.get_or_create_store(document_id)
        if not store_name:
            return {"success": True, "message": "No store found"}

        try:
            self.client.file_search_stores.delete(
                name=store_name,
                config={'force': True}
            )
            self._store_cache.pop(document_id, None)
            logger.info(f"Deleted file search store: {store_name}")
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting file search store: {e}")
            return {"success": False, "error": str(e)}

    def list_stores(self) -> List[Dict[str, Any]]:
        """List all file search stores"""
        if not self.client:
            return []
        try:
            stores = []
            for store in self.client.file_search_stores.list():
                stores.append({
                    "name": store.name,
                    "display_name": store.display_name
                })
            return stores
        except Exception as e:
            logger.error(f"Error listing stores: {e}")
            return []


# Global instance
file_search_manager = FileSearchManager()
