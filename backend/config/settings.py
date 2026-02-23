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
    GEMINI_EMBEDDING_MODEL: str = "models/gemini-embedding-001"
    
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
    
    # Vector Database
    VECTOR_DB_PATH: str = "./vector_store"
    
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
        return [
            "http://localhost:3000",
            "http://localhost:3001",
        ]
    
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
