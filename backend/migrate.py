"""
Database migration and management script
"""
import sys
import os
from pathlib import Path

# Fix Unicode encoding for Windows console
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from config.database import Base, engine, init_db
from users.models import User
from documents.models import Document
from notes.models import Note
from summarizer.models import Summary
from quizzes.models import Quiz, QuizQuestion, QuizAttempt
from progress.models import UserProgress, ActivityLog
from career.models import Resume, ResumeAnalysis, CareerRecommendation
from utils.logger import logger

def create_tables():
    """Create all database tables"""
    try:
        logger.info("Creating database tables...")
        init_db()
        logger.info("✅ All tables created successfully!")
        
        # Print table names
        tables = Base.metadata.tables.keys()
        logger.info(f"Created {len(tables)} tables:")
        for table in tables:
            logger.info(f"  - {table}")
            
    except Exception as e:
        logger.error(f"❌ Error creating tables: {str(e)}")
        raise

def drop_tables():
    """Drop all database tables (USE WITH CAUTION!)"""
    try:
        logger.warning("⚠️  Dropping all database tables...")
        response = input("Are you sure you want to drop all tables? (yes/no): ")
        
        if response.lower() == 'yes':
            Base.metadata.drop_all(bind=engine)
            logger.info("✅ All tables dropped successfully!")
        else:
            logger.info("❌ Operation cancelled")
            
    except Exception as e:
        logger.error(f"❌ Error dropping tables: {str(e)}")
        raise

def reset_database():
    """Reset database (drop and recreate tables)"""
    try:
        logger.warning("⚠️  Resetting database...")
        response = input("This will delete all data! Are you sure? (yes/no): ")
        
        if response.lower() == 'yes':
            drop_tables()
            create_tables()
            logger.info("✅ Database reset complete!")
        else:
            logger.info("❌ Operation cancelled")
            
    except Exception as e:
        logger.error(f"❌ Error resetting database: {str(e)}")
        raise

def check_database():
    """Check database connection and tables"""
    try:
        logger.info("Checking database connection...")
        
        # Test connection
        from config.database import SessionLocal
        db = SessionLocal()
        
        # Check if tables exist
        from sqlalchemy import inspect
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        logger.info(f"✅ Database connection successful!")
        logger.info(f"Found {len(existing_tables)} existing tables:")
        for table in existing_tables:
            logger.info(f"  - {table}")
        
        # Check for missing tables
        expected_tables = set(Base.metadata.tables.keys())
        existing_tables_set = set(existing_tables)
        missing_tables = expected_tables - existing_tables_set
        
        if missing_tables:
            logger.warning(f"⚠️  Missing tables: {', '.join(missing_tables)}")
            logger.info("Run 'python migrate.py create' to create missing tables")
        else:
            logger.info("✅ All expected tables exist!")
        
        db.close()
        
    except Exception as e:
        logger.error(f"❌ Database connection failed: {str(e)}")
        raise

def show_help():
    """Show help message"""
    help_text = """
Database Migration Script
========================

Usage: python migrate.py [command]

Commands:
  create/init - Create all database tables
  drop        - Drop all database tables (DESTRUCTIVE!)
  reset       - Drop and recreate all tables (DESTRUCTIVE!)
  check       - Check database connection and existing tables
  help        - Show this help message

Examples:
  python migrate.py create
  python migrate.py init
  python migrate.py check
  python migrate.py reset

Warning: 'drop' and 'reset' commands will delete all data!
"""
    print(help_text)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        show_help()
        sys.exit(0)
    
    command = sys.argv[1].lower()
    
    if command in ["create", "init"]:
        create_tables()
    elif command == "drop":
        drop_tables()
    elif command == "reset":
        reset_database()
    elif command == "check":
        check_database()
    elif command == "help":
        show_help()
    else:
        logger.error(f"Unknown command: {command}")
        show_help()
        sys.exit(1)
