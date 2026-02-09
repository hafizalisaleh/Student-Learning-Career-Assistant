"""
Voice API endpoints with WebSocket support for Gemini Live
"""
import asyncio
import base64
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from config.database import get_db, SessionLocal
from users.auth import get_current_user
from users.models import User
from core.rag_retriever import rag_retriever
from documents.models import Document
from utils.logger import logger

router = APIRouter(prefix="/api/voice", tags=["voice"])


class ConnectionManager:
    """Manage WebSocket connections for voice chat."""

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        logger.info(f"Voice WebSocket connected: {user_id}")

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            logger.info(f"Voice WebSocket disconnected: {user_id}")

    async def send_message(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)


manager = ConnectionManager()


@router.websocket("/ws/{token}")
async def voice_websocket(websocket: WebSocket, token: str):
    """
    WebSocket endpoint for real-time voice chat with Gemini Live.

    Protocol:
    1. Client connects with auth token
    2. Client sends: {"type": "start", "document_id": "optional"}
    3. Client sends audio chunks: {"type": "audio", "data": "base64_audio"}
    4. Server sends responses: {"type": "audio/text/status", "data": "..."}
    5. Client sends: {"type": "end"} to close session
    """
    from voice.gemini_live import GeminiLiveClient
    from jose import jwt, JWTError
    from config.settings import settings

    user_id = None
    gemini_client = None

    try:
        # Verify token
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = payload.get("sub")
            if not user_id:
                await websocket.close(code=4001, reason="Invalid token")
                return
        except JWTError:
            await websocket.close(code=4001, reason="Invalid token")
            return

        # Accept connection
        await manager.connect(websocket, user_id)

        # Initialize Gemini Live client
        gemini_client = GeminiLiveClient()
        audio_buffer = []

        # Callbacks for Gemini responses
        async def on_audio(audio_data: bytes):
            await websocket.send_json({
                "type": "audio",
                "data": base64.b64encode(audio_data).decode("utf-8")
            })

        async def on_text(text: str):
            await websocket.send_json({
                "type": "text",
                "data": text
            })

        async def on_turn_complete():
            await websocket.send_json({
                "type": "turn_complete"
            })

        # Main message loop
        while True:
            try:
                message = await websocket.receive_json()
                msg_type = message.get("type")

                if msg_type == "start":
                    # Start voice session
                    document_id = message.get("document_id")
                    context = ""

                    # Get document context if provided
                    if document_id:
                        db = SessionLocal()
                        try:
                            doc = db.query(Document).filter(Document.id == document_id).first()
                            if doc:
                                result = rag_retriever.get_content_for_generation(
                                    document=doc,
                                    task_type="voice_chat",
                                    chunk_count=5
                                )
                                context = result.get("content", "")[:8000]  # Limit context size
                        finally:
                            db.close()

                    # System instruction with optional context
                    system_instruction = """You are a helpful AI assistant that answers questions about documents.
Be conversational and natural in your responses. Keep answers concise but informative.
If you don't know something, say so honestly."""

                    if context:
                        system_instruction += f"\n\nHere is the document content to reference:\n{context}"

                    # Connect to Gemini Live
                    await gemini_client.connect(
                        system_instruction=system_instruction,
                        on_audio=on_audio,
                        on_text=on_text,
                        on_turn_complete=on_turn_complete
                    )

                    await websocket.send_json({
                        "type": "status",
                        "data": "connected",
                        "message": "Voice session started"
                    })

                elif msg_type == "audio":
                    # Receive audio chunk from client
                    if gemini_client and gemini_client.is_connected:
                        audio_data = base64.b64decode(message.get("data", ""))
                        await gemini_client.send_audio(audio_data)

                elif msg_type == "text":
                    # Receive text message (fallback)
                    if gemini_client and gemini_client.is_connected:
                        await gemini_client.send_text(message.get("data", ""))

                elif msg_type == "end":
                    # End session
                    if gemini_client:
                        await gemini_client.disconnect()
                    await websocket.send_json({
                        "type": "status",
                        "data": "disconnected"
                    })
                    break

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Voice WebSocket error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "data": str(e)
                })

    except Exception as e:
        logger.error(f"Voice WebSocket connection error: {e}")
    finally:
        if gemini_client:
            await gemini_client.disconnect()
        if user_id:
            manager.disconnect(user_id)


@router.post("/transcribe")
async def transcribe_audio(
    current_user: User = Depends(get_current_user)
):
    """
    Simple audio transcription endpoint (non-streaming).
    For fallback when WebSocket is not available.
    """
    # This would use Gemini's audio understanding
    return {"message": "Use WebSocket endpoint for voice features"}


@router.get("/status")
async def voice_status(
    current_user: User = Depends(get_current_user)
):
    """Check voice service availability."""
    from config.settings import settings

    has_api_key = bool(settings.GOOGLE_API_KEY)

    return {
        "available": has_api_key,
        "model": "gemini-2.0-flash-exp",
        "features": ["real-time-voice", "transcription", "tts"]
    }
