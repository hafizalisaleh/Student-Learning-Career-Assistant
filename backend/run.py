"""
Startup script for SLCA backend
"""
import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

def check_environment():
    """Check if all required environment variables are set"""
    from utils.logger import logger
    
    required_vars = [
        'DATABASE_URL',
        'SECRET_KEY',
        'GOOGLE_API_KEY'
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        logger.error("Missing required environment variables:")
        for var in missing_vars:
            logger.error(f"  - {var}")
        logger.info("\nPlease create a .env file with required variables")
        logger.info("   See .env.example for template")
        return False
    
    logger.info("All required environment variables are set")
    return True

def check_directories():
    """Create necessary directories if they don't exist"""
    from utils.logger import logger
    
    directories = [
        'uploads',
        'uploads/documents',
        'uploads/resumes',
        'vector_store',
        'logs'
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
        logger.info(f"Directory ensured: {directory}")

def check_database():
    """Check database connection"""
    from utils.logger import logger
    from config.database import engine
    from sqlalchemy import text
    
    try:
        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection successful")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {str(e)}")
        logger.info("\nMake sure PostgreSQL is running and DATABASE_URL is correct")
        return False

def initialize_database():
    """Check if database tables exist"""
    from utils.logger import logger
    from config.database import engine
    from sqlalchemy import inspect
    
    try:
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        if len(existing_tables) > 0:
            logger.info(f"Database already initialized with {len(existing_tables)} tables")
            return True
        else:
            logger.info("Initializing database tables...")
            from config.database import init_db
            init_db()
            logger.info("Database tables initialized")
            return True
    except Exception as e:
        logger.error(f"Failed to check/initialize database: {str(e)}")
        return False

def check_api_keys():
    """Check if API keys are configured"""
    from utils.logger import logger
    import os
    
    api_keys = {
        'GOOGLE_API_KEY': 'Google Gemini API',
        'SUPADATA_API_KEY': 'Supadata (YouTube)',
        'EXTRACTOR_API_KEY': 'ExtractorAPI (Web)',
        'OCR_API_KEY': 'OCR Service'
    }
    
    configured = []
    missing = []
    
    for key, service in api_keys.items():
        if os.getenv(key):
            configured.append(service)
        else:
            missing.append(service)
    
    if configured:
        logger.info(f"Configured API keys: {', '.join(configured)}")
    
    if missing:
        logger.warning(f"Missing API keys: {', '.join(missing)}")
        logger.info("   Some features may not work without these keys")

def run_startup_checks():
    """Run all startup checks"""
    from utils.logger import logger
    
    logger.info("=" * 50)
    logger.info("SLCA Backend - Startup Checks")
    logger.info("=" * 50)
    
    # Check environment variables
    if not check_environment():
        return False
    
    # Create directories
    check_directories()
    
    # Check database
    if not check_database():
        return False
    
    # Initialize database
    if not initialize_database():
        return False
    
    # Check API keys
    check_api_keys()
    
    logger.info("=" * 50)
    logger.info("All startup checks passed!")
    logger.info("=" * 50)
    
    return True

def start_server():
    """Start the FastAPI server"""
    import uvicorn
    from config.settings import settings
    from utils.logger import logger
    
    logger.info(f"Starting SLCA server on {settings.HOST}:{settings.PORT}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"API Documentation: http://{settings.HOST}:{settings.PORT}/docs")
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )

if __name__ == "__main__":
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()
    
    # Run startup checks
    if run_startup_checks():
        # Start server
        start_server()
    else:
        print("\nStartup checks failed. Please fix the errors above and try again.")
        sys.exit(1)
