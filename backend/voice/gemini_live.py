"""
Gemini Live API Integration for Real-Time Voice
"""
import asyncio
import json
import base64
from typing import Optional, Callable, Any
import websockets
from config.settings import settings
from utils.logger import logger


class GeminiLiveClient:
    """
    Client for Gemini Live API real-time voice streaming.
    Uses WebSocket for bidirectional audio communication.
    """

    def __init__(self):
        self.api_key = settings.GOOGLE_API_KEY
        self.model = "gemini-2.0-flash-exp"
        self.ws_url = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={self.api_key}"
        self.connection = None
        self.is_connected = False

    async def connect(
        self,
        system_instruction: str = None,
        on_audio: Callable[[bytes], Any] = None,
        on_text: Callable[[str], Any] = None,
        on_turn_complete: Callable[[], Any] = None
    ):
        """
        Establish WebSocket connection to Gemini Live API.

        Args:
            system_instruction: System prompt for the model
            on_audio: Callback for audio output chunks
            on_text: Callback for text transcripts
            on_turn_complete: Callback when model finishes speaking
        """
        try:
            logger.info("Connecting to Gemini Live API...")
            self.connection = await websockets.connect(
                self.ws_url,
                additional_headers={"Content-Type": "application/json"},
                ping_interval=30,
                ping_timeout=10
            )
            self.is_connected = True
            logger.info("Connected to Gemini Live API")

            # Send setup message
            setup_msg = {
                "setup": {
                    "model": f"models/{self.model}",
                    "generation_config": {
                        "response_modalities": ["AUDIO", "TEXT"],
                        "speech_config": {
                            "voice_config": {
                                "prebuilt_voice_config": {
                                    "voice_name": "Aoede"  # Natural voice
                                }
                            }
                        }
                    }
                }
            }

            if system_instruction:
                setup_msg["setup"]["system_instruction"] = {
                    "parts": [{"text": system_instruction}]
                }

            await self.connection.send(json.dumps(setup_msg))
            logger.info("Setup message sent")

            # Wait for setup confirmation
            setup_response = await self.connection.recv()
            setup_data = json.loads(setup_response)
            logger.info(f"Setup response: {setup_data}")

            # Start receiving messages
            asyncio.create_task(self._receive_loop(on_audio, on_text, on_turn_complete))

            return True

        except Exception as e:
            logger.error(f"Failed to connect to Gemini Live: {e}")
            self.is_connected = False
            raise

    async def _receive_loop(
        self,
        on_audio: Callable[[bytes], Any] = None,
        on_text: Callable[[str], Any] = None,
        on_turn_complete: Callable[[], Any] = None
    ):
        """Receive and process messages from Gemini Live API."""
        try:
            async for message in self.connection:
                data = json.loads(message)

                # Handle server content (audio/text responses)
                if "serverContent" in data:
                    content = data["serverContent"]

                    # Check if turn is complete
                    if content.get("turnComplete"):
                        logger.info("Turn complete")
                        if on_turn_complete:
                            await self._call_async(on_turn_complete)

                    # Process model turn content
                    if "modelTurn" in content:
                        parts = content["modelTurn"].get("parts", [])
                        for part in parts:
                            # Audio output
                            if "inlineData" in part:
                                audio_data = base64.b64decode(part["inlineData"]["data"])
                                if on_audio:
                                    await self._call_async(on_audio, audio_data)

                            # Text transcript
                            if "text" in part:
                                if on_text:
                                    await self._call_async(on_text, part["text"])

        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket connection closed")
            self.is_connected = False
        except Exception as e:
            logger.error(f"Error in receive loop: {e}")
            self.is_connected = False

    async def _call_async(self, func: Callable, *args):
        """Call function, handling both sync and async functions."""
        result = func(*args)
        if asyncio.iscoroutine(result):
            await result

    async def send_audio(self, audio_data: bytes):
        """
        Send audio data to Gemini Live API.

        Args:
            audio_data: Raw 16-bit PCM audio at 16kHz
        """
        if not self.is_connected or not self.connection:
            raise RuntimeError("Not connected to Gemini Live API")

        message = {
            "realtimeInput": {
                "mediaChunks": [{
                    "mimeType": "audio/pcm;rate=16000",
                    "data": base64.b64encode(audio_data).decode("utf-8")
                }]
            }
        }

        await self.connection.send(json.dumps(message))

    async def send_text(self, text: str):
        """
        Send text message to Gemini Live API.

        Args:
            text: Text message to send
        """
        if not self.is_connected or not self.connection:
            raise RuntimeError("Not connected to Gemini Live API")

        message = {
            "clientContent": {
                "turns": [{
                    "role": "user",
                    "parts": [{"text": text}]
                }],
                "turnComplete": True
            }
        }

        await self.connection.send(json.dumps(message))

    async def send_context(self, context: str):
        """
        Send context/document content to Gemini for reference.

        Args:
            context: Document context for RAG
        """
        if not self.is_connected or not self.connection:
            raise RuntimeError("Not connected to Gemini Live API")

        message = {
            "clientContent": {
                "turns": [{
                    "role": "user",
                    "parts": [{"text": f"[DOCUMENT CONTEXT]\n{context}\n[END CONTEXT]\n\nPlease acknowledge you have this context. Answer questions based on this content."}]
                }],
                "turnComplete": True
            }
        }

        await self.connection.send(json.dumps(message))
        logger.info(f"Sent context to Gemini Live ({len(context)} chars)")

    async def disconnect(self):
        """Close the WebSocket connection."""
        if self.connection:
            await self.connection.close()
            self.is_connected = False
            logger.info("Disconnected from Gemini Live API")


# Simpler approach using standard Gemini API with audio
class GeminiVoiceSimple:
    """
    Simpler voice implementation using standard Gemini API.
    Uses speech-to-text for input and text-to-speech for output.
    """

    def __init__(self):
        import google.generativeai as genai
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        self.model = genai.GenerativeModel("gemini-2.0-flash-exp")

    async def process_audio_query(
        self,
        audio_data: bytes,
        context: str = None,
        mime_type: str = "audio/wav"
    ) -> dict:
        """
        Process audio query and return response.

        Args:
            audio_data: Audio bytes
            context: Optional RAG context
            mime_type: Audio MIME type

        Returns:
            Dict with text response and audio (if available)
        """
        try:
            import google.generativeai as genai

            # Create content parts
            parts = []

            # Add context if provided
            if context:
                parts.append(f"[DOCUMENT CONTEXT]\n{context}\n[END CONTEXT]\n\nAnswer based on this context:")

            # Add audio
            parts.append({
                "inline_data": {
                    "mime_type": mime_type,
                    "data": base64.b64encode(audio_data).decode("utf-8")
                }
            })

            # Generate response
            response = self.model.generate_content(parts)

            return {
                "success": True,
                "text": response.text,
                "audio": None  # Would need separate TTS for audio output
            }

        except Exception as e:
            logger.error(f"Voice processing error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
