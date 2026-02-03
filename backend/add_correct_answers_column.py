"""
Migration script to add correct_answers column to quiz_attempts table
"""
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from config.database import engine
from sqlalchemy import text
from utils.logger import logger

def add_correct_answers_column():
    """Add correct_answers column to quiz_attempts table"""
    try:
        logger.info("Adding correct_answers column to quiz_attempts table...")
        
        with engine.connect() as conn:
            # Check if column already exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='quiz_attempts' 
                AND column_name='correct_answers'
            """)
            
            result = conn.execute(check_query)
            exists = result.fetchone()
            
            if exists:
                logger.info("✅ Column 'correct_answers' already exists!")
                return
            
            # Add the column
            alter_query = text("""
                ALTER TABLE quiz_attempts 
                ADD COLUMN correct_answers INTEGER
            """)
            
            conn.execute(alter_query)
            conn.commit()
            
            logger.info("✅ Successfully added 'correct_answers' column to quiz_attempts table!")
            
    except Exception as e:
        logger.error(f"❌ Error adding column: {str(e)}")
        raise

if __name__ == "__main__":
    add_correct_answers_column()
