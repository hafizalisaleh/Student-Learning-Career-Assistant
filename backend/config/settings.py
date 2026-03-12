"""
Application settings and configuration
"""
import os
from pathlib import Path
from typing import List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Settings(BaseSettings):
    """Application settings"""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )
    
    # App Configuration
    APP_NAME: str = "Student Learning & Career Assistant"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Database
    DATABASE_URL: str = "postgresql://slca_user:password@localhost:5432/slca_db"
    
    # JWT Configuration
    SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24
    
    # AI Services
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_EMBEDDING_MODEL: str = "models/gemini-embedding-001"  # Legacy, kept for compatibility

    # Groq
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_VISION_MODEL: str = "meta-llama/llama-4-scout-17b-16e-instruct"
    GROQ_RESEARCH_MODEL: str = "groq/compound-mini"
    GROQ_DEEP_RESEARCH_MODEL: str = "groq/compound"
    GROQ_STRUCTURED_MODEL: str = "openai/gpt-oss-20b"
    GROQ_AGENT_MODEL: str = "openai/gpt-oss-120b"

    # Provider routing for Docling RAG
    RAG_LLM_PROVIDER: str = "groq"  # gemini | groq | ollama
    RAG_VISION_PROVIDER: str = "groq"  # groq | ollama | gemini
    RAG_VISION_MODE: str = "auto"  # auto | always | off

    # Ollama
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3.5:0.8b"
    OLLAMA_VISION_MODEL: str = "qwen3.5:0.8b"
    OLLAMA_NUM_CTX: int = 16384

    # Vision/debug artifacts
    VISION_RESPONSES_MD: str = "runtime/vision_responses.md"
    VISION_CACHE_DIR: str = ".vision_cache"
    VISION_QUERY_DEFAULT_LIMIT: int = 6
    VISION_MAX_IMAGES: int = 3

    # Local Embeddings (replaces Gemini embeddings)
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIMENSION: int = 384
    EMBEDDING_DEVICE: str = "auto"  # auto, cpu, cuda, mps

    # Docling ingestion behavior
    DOCLING_HYBRID_TOKENIZER: str = "sentence-transformers/all-MiniLM-L6-v2"
    DOCLING_HYBRID_MAX_TOKENS: int = 128
    DOCLING_HYBRID_MERGE_PEERS: bool = False
    DOCLING_FORMULA_ENRICHMENT: bool = True
    DOCLING_ENABLE_PDF_PAGE_OCR: bool = True
    DOCLING_PDF_OCR_DPI: int = 200
    DOCLING_PDF_OCR_MIN_CHARS: int = 20
    DOCLING_IMAGE_SCALE: float = 1.5
    DOCLING_GENERATE_PICTURE_IMAGES: bool = True
    DOCLING_GENERATE_TABLE_IMAGES: bool = True
    
    # External APIs (Optional - will use defaults if not in .env)
    SUPADATA_API_KEY: str = ""
    EXTRACTOR_API_KEY: str = ""
    OCR_API_KEY: str = ""
    OCR_API_SECRET: str = ""
    OCR_API_URL: str = "https://www.imagetotext.com/api/ocr"
    OCR_SERVICE: str = "api"
    
    @property
    def supadata_key(self) -> str:
        """Get Supadata API key with fallback to default"""
        return self.SUPADATA_API_KEY or "sd_9ca474be577377227db0a0a4a023dffb"
    
    @property
    def extractor_key(self) -> str:
        """Get ExtractorAPI key with fallback to default"""
        return self.EXTRACTOR_API_KEY or "a876ddff9cf8628284d2d765e7cb040ab23fd7fa"
    
    @property
    def ocr_key(self) -> str:
        """Get OCR API key with fallback to default"""
        return self.OCR_API_KEY or "197a54c4-8420-11f0-a2aa-10bf487fdf8e"
    
    @property
    def ocr_secret(self) -> str:
        """Get OCR API secret with fallback to default"""
        return self.OCR_API_SECRET or "197a54dd-8420-11f0-a2aa-10bf487fdf8e"
    
    # Vector Database (PGVector - uses same DATABASE_URL)
    
    # File Upload Configuration
    MAX_FILE_SIZE_MB: int = 50
    UPLOAD_FOLDER: str = "uploads"
    ALLOWED_EXTENSIONS: str = "pdf,docx,pptx,jpg,jpeg,png,txt,xlsx,csv,md,json"
    
    # Email Configuration
    EMAIL_HOST: str = "smtp.gmail.com"
    EMAIL_PORT: int = 587
    EMAIL_USER: str = ""
    EMAIL_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@slca.com"
    
    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"
    
    @property
    def cors_origins(self) -> List[str]:
        """Get CORS origins list"""
        origins = {
            self.FRONTEND_URL.rstrip("/"),
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        }
        return sorted(origin for origin in origins if origin)
    
    @property
    def allowed_extensions_list(self) -> List[str]:
        """Convert ALLOWED_EXTENSIONS string to list"""
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(",")]
    
    @property
    def upload_folder_path(self) -> Path:
        """Get upload folder as Path object"""
        return Path(self.UPLOAD_FOLDER)

# Global settings instance
settings = Settings()

# Ensure upload directory exists
settings.upload_folder_path.mkdir(parents=True, exist_ok=True)
