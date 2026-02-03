"""
Migration script to update resume_analysis table schema
"""
from sqlalchemy import create_engine, text
from config.settings import settings
import sys

def migrate():
    """Update resume_analysis table to match new schema"""
    engine = create_engine(settings.DATABASE_URL)
    
    try:
        with engine.connect() as conn:
            print("🔄 Starting migration...")
            
            # Drop old columns
            print("📝 Dropping old columns...")
            try:
                conn.execute(text("ALTER TABLE resume_analysis DROP COLUMN IF EXISTS overall_score CASCADE"))
                conn.execute(text("ALTER TABLE resume_analysis DROP COLUMN IF EXISTS section_scores CASCADE"))
                conn.execute(text("ALTER TABLE resume_analysis DROP COLUMN IF EXISTS recommendations CASCADE"))
                conn.execute(text("ALTER TABLE resume_analysis DROP COLUMN IF EXISTS keywords_found CASCADE"))
                conn.execute(text("ALTER TABLE resume_analysis DROP COLUMN IF EXISTS keywords_missing CASCADE"))
                conn.commit()
                print("✅ Old columns dropped")
            except Exception as e:
                print(f"⚠️  Some columns might not exist: {e}")
                conn.rollback()
            
            # Add new columns
            print("📝 Adding new columns...")
            try:
                conn.execute(text("ALTER TABLE resume_analysis ADD COLUMN IF NOT EXISTS strengths JSONB"))
                conn.execute(text("ALTER TABLE resume_analysis ADD COLUMN IF NOT EXISTS weaknesses JSONB"))
                conn.execute(text("ALTER TABLE resume_analysis ADD COLUMN IF NOT EXISTS improvement_suggestions JSONB"))
                conn.execute(text("ALTER TABLE resume_analysis ADD COLUMN IF NOT EXISTS keyword_match_score FLOAT"))
                conn.execute(text("ALTER TABLE resume_analysis ADD COLUMN IF NOT EXISTS formatting_score FLOAT"))
                conn.execute(text("ALTER TABLE resume_analysis ADD COLUMN IF NOT EXISTS content_quality_score FLOAT"))
                conn.commit()
                print("✅ New columns added")
            except Exception as e:
                print(f"❌ Error adding columns: {e}")
                conn.rollback()
                return False
            
            # Verify columns
            print("🔍 Verifying new schema...")
            result = conn.execute(text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'resume_analysis'
                ORDER BY ordinal_position
            """))
            
            print("\n📊 Resume Analysis Table Columns:")
            for row in result:
                print(f"  - {row[0]}: {row[1]}")
            
            print("\n✅ Migration completed successfully!")
            return True
            
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
