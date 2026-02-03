"""
Database migration: Add topic tracking fields to documents table
"""
from sqlalchemy import create_engine, text
from config.settings import settings

def migrate():
    """Add topic tracking columns to documents table"""
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Add topics column (JSONB)
        try:
            conn.execute(text("""
                ALTER TABLE documents 
                ADD COLUMN IF NOT EXISTS topics JSONB
            """))
            conn.commit()
            print("✓ Added 'topics' column")
        except Exception as e:
            print(f"Topics column: {e}")
        
        # Add domains column (JSONB)
        try:
            conn.execute(text("""
                ALTER TABLE documents 
                ADD COLUMN IF NOT EXISTS domains JSONB
            """))
            conn.commit()
            print("✓ Added 'domains' column")
        except Exception as e:
            print(f"Domains column: {e}")
        
        # Add keywords column (JSONB)
        try:
            conn.execute(text("""
                ALTER TABLE documents 
                ADD COLUMN IF NOT EXISTS keywords JSONB
            """))
            conn.commit()
            print("✓ Added 'keywords' column")
        except Exception as e:
            print(f"Keywords column: {e}")
        
        # Add difficulty_level column
        try:
            conn.execute(text("""
                ALTER TABLE documents 
                ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(50)
            """))
            conn.commit()
            print("✓ Added 'difficulty_level' column")
        except Exception as e:
            print(f"Difficulty level column: {e}")
        
        # Add subject_area column
        try:
            conn.execute(text("""
                ALTER TABLE documents 
                ADD COLUMN IF NOT EXISTS subject_area VARCHAR(200)
            """))
            conn.commit()
            print("✓ Added 'subject_area' column")
        except Exception as e:
            print(f"Subject area column: {e}")
        
        # Verify columns
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'documents'
            ORDER BY ordinal_position
        """))
        columns = [row[0] for row in result]
        print(f"\n📋 Documents table columns: {', '.join(columns)}")
        
        print("\n✅ Migration completed successfully!")

if __name__ == "__main__":
    migrate()
