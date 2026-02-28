"""
Main FastAPI application
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from config.settings import settings
from config.database import init_db
from users.views import router as users_router
from documents.views import router as documents_router
from notes.views import router as notes_router
from summarizer.views import router as summarizer_router
from quizzes.views import router as quizzes_router
from progress.views import router as progress_router
from career.views import router as career_router
from core.views import router as vectors_router
from voice.views import router as voice_router
from utils.logger import logger
import traceback

from contextlib import asynccontextmanager

# Define lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events for the FastAPI application"""
    logger.info("=" * 50)
    logger.info("Starting SLCA Backend Server")
    logger.info("=" * 50)
    
    # Initialize database
    try:
        init_db()
        logger.info("[OK] Database initialized successfully")
    except Exception as e:
        logger.error(f"[ERROR] Database initialization failed: {str(e)}")
        # We don't raise here to allow the server to start even if DB is down (for health checks)
        # but in production you might want to stop startup
    
    # Create upload directories
    from pathlib import Path
    directories = ['uploads/documents', 'uploads/resumes', 'vector_store', 'logs']
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
    logger.info("[OK] Upload directories created")

    # Initialize vector store
    try:
        from core.vector_store import vector_store
        stats = vector_store.get_collection_stats()
        logger.info(f"[OK] Vector store initialized - {stats.get('total_chunks', 0)} chunks in store")
    except Exception as e:
        logger.warning(f"[WARN] Vector store initialization: {str(e)}")
    
    # Check Groq Fallback Status
    try:
        from utils.groq_client import groq_client
        if groq_client.api_key:
            logger.info(f"[OK] Groq fallback ready using model: {groq_client.model_id}")
        else:
            logger.warning("[WARN] Groq API Key not found in .env. Fallback will be disabled.")
    except Exception as e:
        logger.error(f"[ERROR] Groq client initialization: {str(e)}")
    
    logger.info(f"[OK] Server started on {settings.HOST}:{settings.PORT}")
    logger.info(f"[INFO] API Documentation: http://{settings.HOST}:{settings.PORT}/docs")
    logger.info("=" * 50)

    yield  # Application runs here

    # Cleanup on shutdown
    logger.info("Shutting down SLCA Backend Server...")
    logger.info("[OK] Cleanup completed")

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Student Learning & Career Assistant API",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all uncaught exceptions"""
    logger.error(f"Unhandled exception: {str(exc)}")
    logger.error(traceback.format_exc())
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error occurred",
            "path": str(request.url)
        }
    )

# Validation error handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors"""
    logger.warning(f"Validation error: {exc.errors()}")
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "errors": exc.errors()
        }
    )

# Include routers
app.include_router(users_router)
app.include_router(documents_router)
app.include_router(notes_router)
app.include_router(summarizer_router)
app.include_router(quizzes_router)
app.include_router(progress_router)
app.include_router(career_router)
app.include_router(vectors_router)
app.include_router(voice_router)

@app.get("/")
def read_root():
    """Root endpoint"""
    return {
        "message": "Welcome to SLCA API",
        "version": settings.VERSION,
        "docs": "/docs"
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
