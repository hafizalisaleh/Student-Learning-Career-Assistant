# SLCA Backend - Smart Learning and Career Assistant

Complete FastAPI backend implementation for the SLCA platform.

## 📋 Table of Contents
- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Database Management](#database-management)
- [Modules Overview](#modules-overview)
- [Utilities](#utilities)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The SLCA Backend is a production-ready FastAPI application that powers an AI-driven educational platform. It provides:

- **8 Core Modules**: User authentication, document processing, note-taking, summarization, quizzes, progress tracking, and career guidance
- **34 API Endpoints**: Comprehensive REST API for all platform features
- **12 Database Tables**: Relational data model with SQLAlchemy ORM
- **RAG Pipeline**: Retrieval-Augmented Generation using ChromaDB and LlamaIndex
- **AI Integration**: Google Gemini 2.5 Flash for content generation
- **File Processing**: Support for PDF, DOCX, PPTX, TXT, MD, CSV, images, and videos
- **Production Features**: Logging, error handling, validation, migration scripts

## 🛠 Technology Stack

### Core Framework
- **FastAPI** - Modern, high-performance web framework
- **Uvicorn** - ASGI server for production deployment
- **Python 3.9+** - Programming language

### Database
- **PostgreSQL** - Primary relational database
- **SQLAlchemy** - ORM for database interactions
- **Alembic** - Database migrations (optional)

### AI & Machine Learning
- **Google Gemini 2.5 Flash** - Large language model
- **ChromaDB** - Vector database for embeddings
- **LlamaIndex** - Data framework for LLM applications
- **Langchain** - Framework for LLM-powered apps
- **Sentence Transformers** - Text embeddings

### Authentication & Security
- **python-jose** - JWT token handling
- **bcrypt** - Password hashing
- **python-multipart** - File upload handling

### Content Processing
- **PyPDF2** - PDF text extraction
- **python-docx** - Word document processing
- **python-pptx** - PowerPoint processing
- **pandas** - CSV/Excel processing
- **Pillow (PIL)** - Image processing
- **Tesseract OCR** - Optical character recognition
- **opencv-python** - Video processing

### External APIs
- **Supadata API** - YouTube content extraction
- **ExtractorAPI** - Web content extraction
- **OCR.space API** - Image text extraction

## 📁 Project Structure

```
backend/
├── main.py                 # FastAPI application entry point
├── run.py                  # Production startup script
├── migrate.py              # Database migration CLI
├── requirements.txt        # Python dependencies
├── .env                    # Environment variables (create from .env.example)
│
├── config/                 # Configuration modules
│   ├── __init__.py
│   ├── database.py         # Database connection & initialization
│   └── settings.py         # Environment settings & configuration
│
├── models/                 # SQLAlchemy database models
│   ├── __init__.py
│   ├── user.py             # User, VerificationToken, PasswordResetToken
│   ├── document.py         # Document model
│   ├── note.py             # Note model
│   ├── summary.py          # Summary model
│   ├── quiz.py             # Quiz, QuizQuestion, QuizAttempt
│   ├── progress.py         # UserProgress, ActivityLog
│   └── career.py           # Resume, ResumeAnalysis, CareerRecommendation
│
├── modules/                # Business logic modules
│   ├── users/              # Authentication & user management
│   │   ├── __init__.py
│   │   ├── router.py       # API endpoints (6 routes)
│   │   ├── schemas.py      # Pydantic models
│   │   └── service.py      # Business logic
│   │
│   ├── documents/          # Document upload & processing
│   │   ├── __init__.py
│   │   ├── router.py       # API endpoints (5 routes)
│   │   ├── schemas.py
│   │   └── service.py
│   │
│   ├── notes/              # Note-taking with AI assistance
│   │   ├── __init__.py
│   │   ├── router.py       # API endpoints (5 routes)
│   │   ├── schemas.py
│   │   └── service.py
│   │
│   ├── summarizer/         # Content summarization
│   │   ├── __init__.py
│   │   ├── router.py       # API endpoints (4 routes)
│   │   ├── schemas.py
│   │   └── service.py
│   │
│   ├── quizzes/            # Quiz generation & management
│   │   ├── __init__.py
│   │   ├── router.py       # API endpoints (6 routes)
│   │   ├── schemas.py
│   │   └── service.py
│   │
│   ├── progress/           # Learning progress tracking
│   │   ├── __init__.py
│   │   ├── router.py       # API endpoints (4 routes)
│   │   ├── schemas.py
│   │   └── service.py
│   │
│   └── career/             # Career guidance & resume analysis
│       ├── __init__.py
│       ├── router.py       # API endpoints (4 routes)
│       ├── schemas.py
│       └── service.py
│
├── utils/                  # Utility modules
│   ├── __init__.py
│   ├── validators.py       # Validation classes (FileValidator, URLValidator, etc.)
│   ├── helpers.py          # Helper functions (20+ utilities)
│   ├── exceptions.py       # Custom exception hierarchy (12 classes)
│   └── logger.py           # Logging configuration
│
├── uploads/                # Uploaded files (created at runtime)
│   ├── documents/
│   └── resumes/
│
├── vector_store/           # ChromaDB vector database (created at runtime)
│
└── logs/                   # Application logs (created at runtime)
    ├── slca.log            # Main application log
    └── errors.log          # Error-only log
```

## 🚀 Installation

### Prerequisites
- Python 3.9 or higher
- PostgreSQL 12 or higher
- Google Gemini API key
- Tesseract OCR (for image text extraction)

### Step 1: Clone Repository
```powershell
cd "c:\Users\Syed Basit Abbas\OneDrive\Desktop\SLCA_FYP"
cd backend
```

### Step 2: Create Virtual Environment
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### Step 3: Install Dependencies
```powershell
pip install -r requirements.txt
```

### Step 4: Install Tesseract OCR
Download and install from: https://github.com/UB-Mannheim/tesseract/wiki
Add to PATH: `C:\Program Files\Tesseract-OCR`

### Step 5: Create Environment File
Copy `.env.example` to `.env` and configure:
```powershell
cp .env.example .env
```

## ⚙️ Configuration

### Environment Variables (.env)

```env
# Application Settings
APP_NAME=SLCA Backend
DEBUG=True
HOST=0.0.0.0
PORT=8000

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/slca_db

# Security
SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Google Gemini API
GOOGLE_API_KEY=your-google-gemini-api-key

# External APIs
SUPADATA_API_KEY=your-supadata-api-key
EXTRACTOR_API_KEY=your-extractor-api-key
OCR_API_KEY=your-ocr-space-api-key

# File Upload Settings
MAX_UPLOAD_SIZE=10485760  # 10MB in bytes
ALLOWED_EXTENSIONS=pdf,docx,pptx,txt,md,csv,jpg,png,jpeg

# CORS Origins
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Email Configuration (for production)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@slca.com
```

### Database Setup

1. **Create PostgreSQL Database**
```powershell
# Using psql
psql -U postgres
CREATE DATABASE slca_db;
CREATE USER slca_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE slca_db TO slca_user;
\q
```

2. **Initialize Database Tables**
```powershell
python migrate.py create
```

## 🏃 Running the Application

### Development Mode

**Option 1: Using run.py (Recommended)**
```powershell
python run.py
```
This script:
- Validates environment variables
- Checks database connection
- Creates necessary directories
- Initializes database tables
- Validates API keys
- Starts server with hot reload

**Option 2: Using uvicorn directly**
```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production Mode
```powershell
python run.py --production
```
Or:
```powershell
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Access Points
- **API Server**: http://localhost:8000
- **Interactive API Docs (Swagger)**: http://localhost:8000/docs
- **Alternative API Docs (ReDoc)**: http://localhost:8000/redoc

## 📚 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/users/register` | Register new user | ❌ |
| POST | `/api/users/login` | User login | ❌ |
| GET | `/api/users/me` | Get current user | ✅ |
| PUT | `/api/users/me` | Update profile | ✅ |
| POST | `/api/users/verify-email/{token}` | Verify email | ❌ |
| POST | `/api/users/reset-password` | Request password reset | ❌ |
| POST | `/api/users/reset-password/{token}` | Complete password reset | ❌ |

### Document Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/documents/upload` | Upload document | ✅ |
| GET | `/api/documents` | List user documents | ✅ |
| GET | `/api/documents/{id}` | Get document details | ✅ |
| DELETE | `/api/documents/{id}` | Delete document | ✅ |
| POST | `/api/documents/url` | Process URL content | ✅ |

### Notes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/notes` | Create note | ✅ |
| GET | `/api/notes` | List notes | ✅ |
| GET | `/api/notes/{id}` | Get note | ✅ |
| PUT | `/api/notes/{id}` | Update note | ✅ |
| DELETE | `/api/notes/{id}` | Delete note | ✅ |

### Summarization

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/summarizer/generate` | Generate summary | ✅ |
| GET | `/api/summarizer/history` | Get summary history | ✅ |
| GET | `/api/summarizer/{id}` | Get summary | ✅ |
| DELETE | `/api/summarizer/{id}` | Delete summary | ✅ |

### Quizzes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/quizzes/generate` | Generate quiz | ✅ |
| GET | `/api/quizzes` | List quizzes | ✅ |
| GET | `/api/quizzes/{id}` | Get quiz | ✅ |
| POST | `/api/quizzes/{id}/attempt` | Submit quiz attempt | ✅ |
| GET | `/api/quizzes/{id}/attempts` | Get quiz attempts | ✅ |
| GET | `/api/quizzes/analytics` | Get quiz analytics | ✅ |

### Progress Tracking

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/progress/overview` | Get progress overview | ✅ |
| GET | `/api/progress/analytics` | Get detailed analytics | ✅ |
| GET | `/api/progress/activity` | Get activity log | ✅ |
| GET | `/api/progress/insights` | Get AI insights | ✅ |

### Career Guidance

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/career/analyze-resume` | Analyze resume | ✅ |
| GET | `/api/career/recommendations` | Get career recommendations | ✅ |
| GET | `/api/career/resume-analysis/{id}` | Get analysis details | ✅ |
| GET | `/api/career/interview-prep` | Get interview preparation | ✅ |

## 🗄️ Database Management

### Migration Commands

```powershell
# Create all tables
python migrate.py create

# Drop all tables (with confirmation)
python migrate.py drop

# Reset database (drop + create)
python migrate.py reset

# Check database status
python migrate.py check

# Show help
python migrate.py help
```

### Database Models

**12 Tables Across 7 Model Files:**

1. **users** - User accounts with authentication
2. **verification_tokens** - Email verification tokens
3. **password_reset_tokens** - Password reset tokens
4. **documents** - Uploaded documents
5. **notes** - User notes
6. **summaries** - Generated summaries
7. **quizzes** - Quiz definitions
8. **quiz_questions** - Quiz questions
9. **quiz_attempts** - Quiz submission records
10. **user_progress** - Learning progress tracking
11. **activity_logs** - User activity tracking
12. **resumes** - Uploaded resumes
13. **resume_analyses** - Resume analysis results
14. **career_recommendations** - Career guidance data

## 🧩 Modules Overview

### 1. Users Module
**Purpose**: Authentication and user management  
**Features**:
- User registration with email verification
- JWT-based authentication
- Password reset with secure tokens
- Profile management
- Token expiration (30 minutes for access, 24 hours for verification/reset)

**Key Functions**:
- `create_user()` - Register new user with hashed password
- `authenticate_user()` - Login with email/password
- `verify_email()` - Activate account via email token
- `request_password_reset()` - Send reset token
- `reset_password()` - Update password with token

### 2. Documents Module
**Purpose**: File upload and content processing  
**Features**:
- Multi-format file support (PDF, DOCX, PPTX, TXT, MD, CSV)
- Image text extraction (JPG, PNG via OCR)
- Video content processing
- URL content extraction (YouTube, web pages)
- File size validation (10MB limit)
- Vector storage for RAG pipeline

**Key Functions**:
- `upload_document()` - Handle file upload and processing
- `process_url_content()` - Extract content from URLs
- `extract_text()` - Format-specific text extraction
- `create_vector_store()` - Generate embeddings for ChromaDB

### 3. Notes Module
**Purpose**: AI-assisted note-taking  
**Features**:
- Create and manage notes
- AI-powered note enhancement
- Automatic summarization
- Tag management
- Full-text search

**Key Functions**:
- `create_note()` - Create note with AI assistance
- `enhance_note()` - Improve note quality with AI
- `search_notes()` - Semantic search across notes

### 4. Summarizer Module
**Purpose**: Content summarization  
**Features**:
- Multiple summary types (brief, detailed, bullet points)
- Document-based summarization
- URL content summarization
- Custom prompt support
- Summary history management

**Key Functions**:
- `generate_summary()` - Create AI summary
- `get_summary_history()` - Retrieve past summaries
- `format_summary()` - Apply summary style

### 5. Quizzes Module
**Purpose**: Interactive quiz generation and assessment  
**Features**:
- AI-generated quizzes from content
- Multiple question types (MCQ, True/False)
- Difficulty levels (easy, medium, hard)
- Topic-based tracking
- Performance analytics
- Detailed explanations for answers

**Key Functions**:
- `generate_quiz()` - Create quiz with AI
- `submit_quiz_attempt()` - Grade and store results
- `get_quiz_analytics()` - Performance insights by topic
- `parse_quiz_questions()` - Extract questions from AI response

### 6. Progress Module
**Purpose**: Learning analytics and tracking  
**Features**:
- Activity logging (uploads, quizzes, notes, summaries)
- Progress metrics (total items, study streaks)
- Performance trends
- AI-generated insights
- Time-based analytics

**Key Functions**:
- `log_activity()` - Record user actions
- `get_progress_overview()` - Summary statistics
- `get_detailed_analytics()` - Comprehensive metrics
- `generate_ai_insights()` - Personalized recommendations

### 7. Career Module
**Purpose**: Career guidance and resume analysis  
**Features**:
- Resume parsing and analysis
- Skills extraction
- Career path recommendations
- Interview preparation
- Industry trend analysis
- Job role matching

**Key Functions**:
- `analyze_resume()` - Extract and analyze resume data
- `generate_recommendations()` - Career path suggestions
- `get_interview_prep()` - Interview questions and tips
- `match_job_roles()` - Recommend suitable positions

## 🔧 Utilities

### Validators (`utils/validators.py`)

**FileValidator**:
- `validate_extension()` - Check file type
- `validate_size()` - Enforce size limits
- `get_file_extension()` - Extract extension

**URLValidator**:
- `is_youtube_url()` - Detect YouTube links
- `is_valid_url()` - Validate web URLs
- `extract_youtube_id()` - Get video ID

**EmailValidator**:
- `is_valid_email()` - Regex validation

**TextValidator**:
- `validate_length()` - Min/max length checks
- `sanitize_filename()` - Safe filenames
- `count_words()` - Word count

### Helpers (`utils/helpers.py`)

**20+ Utility Functions**:
- `generate_unique_id()` - UUID generation
- `generate_random_token()` - Secure tokens
- `hash_string()` - SHA256 hashing
- `chunk_text()` - Split text for RAG
- `format_file_size()` - Human-readable sizes
- `calculate_percentage()` - Math helper
- `truncate_text()` - Text truncation
- `merge_dicts()` - Dictionary merging
- `remove_duplicates()` - List deduplication
- `paginate()` - Pagination logic
- `extract_keywords()` - Keyword extraction
- `safe_divide()` - Zero-division handling
- `calculate_days_between()` - Date calculations
- `is_recent()` - Recent date checks
- `get_date_range()` - Date range generation

### Exceptions (`utils/exceptions.py`)

**Custom Exception Hierarchy**:
- `SLCAException` - Base exception
- `AuthenticationException` - Auth failures (401)
- `AuthorizationException` - Permission denied (403)
- `ResourceNotFoundException` - Not found (404)
  - `UserNotFoundException`
  - `DocumentNotFoundException`
  - `NoteNotFoundException`
- `ValidationException` - Invalid input (400)
- `FileUploadException` - Upload errors (400)
- `ProcessingException` - Processing failures (500)
- `AIServiceException` - AI API errors (503)
- `DatabaseException` - DB errors (500)

### Logger (`utils/logger.py`)

**Logging Configuration**:
- **Main Log**: `logs/slca.log` (all levels)
- **Error Log**: `logs/errors.log` (ERROR and CRITICAL only)
- **Rotation**: 10MB max file size, 5 backup files
- **Formatters**:
  - Console: Simple format
  - File: Detailed with timestamps, module, level
- **Usage**: `logger = get_logger(__name__)`

## 🧪 Testing

### Manual Testing
Use the interactive API documentation:
```
http://localhost:8000/docs
```

### Test User Creation
```python
# Create test user via API
POST /api/users/register
{
  "email": "test@example.com",
  "password": "SecurePass123!",
  "full_name": "Test User"
}
```

### Test Document Upload
```python
# Upload document
POST /api/documents/upload
Headers: Authorization: Bearer <token>
Body: multipart/form-data with file
```

### Health Check
```python
GET /
Response: {"message": "SLCA Backend API is running", "version": "1.0.0"}
```

## 🚀 Deployment

### Production Checklist

- [ ] Set `DEBUG=False` in `.env`
- [ ] Use strong `SECRET_KEY` (32+ characters)
- [ ] Configure production database
- [ ] Set up SMTP for email sending
- [ ] Configure CORS for production domain
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (Nginx)
- [ ] Set up database backups
- [ ] Configure log rotation
- [ ] Set resource limits
- [ ] Enable monitoring (e.g., Sentry)

### Docker Deployment (Optional)

```dockerfile
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "run.py", "--production"]
```

### Systemd Service (Linux)

```ini
[Unit]
Description=SLCA Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/backend
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/python run.py --production
Restart=always

[Install]
WantedBy=multi-user.target
```

## 🔍 Troubleshooting

### Common Issues

**1. Database Connection Error**
```
Error: could not connect to server
```
**Solution**: Check PostgreSQL is running and DATABASE_URL is correct
```powershell
# Check PostgreSQL status
Get-Service postgresql*

# Test connection
psql -U username -d slca_db
```

**2. Import Errors**
```
ModuleNotFoundError: No module named 'fastapi'
```
**Solution**: Ensure virtual environment is activated and dependencies installed
```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**3. Google Gemini API Error**
```
AIServiceException: Failed to generate content
```
**Solution**: Verify GOOGLE_API_KEY in `.env` is valid and has quota

**4. File Upload Fails**
```
FileUploadException: File size exceeds limit
```
**Solution**: Check file size < 10MB or adjust MAX_UPLOAD_SIZE

**5. CORS Errors**
```
Access-Control-Allow-Origin header is missing
```
**Solution**: Add frontend URL to CORS_ORIGINS in `.env`

### Logging

Check logs for detailed error information:
```powershell
# View main log
Get-Content logs\slca.log -Tail 50

# View error log only
Get-Content logs\errors.log -Tail 50

# Real-time monitoring
Get-Content logs\slca.log -Wait -Tail 20
```

### Database Reset

If database is in inconsistent state:
```powershell
python migrate.py reset
```

## 📞 Support

For issues and questions:
- Check logs in `logs/` directory
- Review API documentation at `/docs`
- Verify environment variables in `.env`
- Ensure all dependencies are installed

## 📄 License

[Your License Here]

## 👥 Contributors

[Your Team Here]

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Status**: Production Ready ✅
