# SLCA - Feature Catalog

Detailed overview of all implemented features in the Smart Learning and Career Assistant (SLCA) platform.

---

## 🔐 User Authentication & Security
- **Multi-Factor Flow**: Registration, Login, and secure Email Verification.
- **JWT Authorization**: Secure, token-based sessions for all protected routes.
- **Secure Storage**: Password hashing using `bcrypt` (10 rounds).
- **Password Recovery**: Token-based password reset system.
- **Profile Management**: Customizable user settings and profile details.

## 📄 Document Management
- **Omni-Format Support**: Process PDF, DOCX, PPTX, TXT, MD, CSV, XLSX.
- **Visual Intelligence**: OCR-powered text extraction from JPG, PNG, JPEG.
- **Video & Web**: Extract content from MP4/AVI videos and direct URLs (YouTube/Web).
- **Advanced Parsing**: Structured extraction using `PyPDF2`, `python-docx`, and `pandas`.
- **Validation**: Strict file size (10MB) and extension enforcement.

## 🧠 AI & RAG Pipeline (The "Brain")
- **Hybrid LLM Engine**: Native integration with **Google Gemini 1.5/2.0**.
- **Groq Fallback**: Intelligent failover to **Groq ($\text{Llama 3.3 70B}$)** if Gemini quotas are exceeded.
- **Vector Intelligence**: Local vector store powered by **ChromaDB**.
- **Contextual Search**: RAG-based search that "understands" your documents.
- **Cited Sources**: AI answers include interactive citations ([1], [2]) linking directly to source segments.
- **Knowledge Graph**: Interactive 2D/3D Mind Map visualizing connections between topics.

## 📝 Study Tools
- **Smart Notes**: Create, edit, and categorize notes with AI-powered enhancement.
- **Automated Summaries**: Generate Brief, Detailed, or Bulleted summaries of any document.
- **AI Quizzer**: Generate MCQs and True/False questions from your documents.
- **Instant Grading**: Automated assessment with detailed explanations for every answer.

## 📈 Progress & Analytics
- **Study Streaks**: Daily activity tracking to maintain learning momentum.
- **Topic Mastery**: Performance analytics grouped by subject/topic.
- **Activity Logs**: Comprehensive history of all document uploads, notes, and quizzes.
- **AI Insights**: Personalized learning recommendations based on your progress.

## 💼 Career Guidance
- **Resume Pulse**: AI-powered analysis of resumes for skills, experience, and scoring.
- **Career Matching**: Job role recommendations based on your extracted skill set.
- **Interview Prep**: Generated interview questions tailored to your field.
- **Improvement Roadmap**: Actionable suggestions to enhance your professional profile.

---

## 🛠️ Technical Stack
- **Frontend**: Next.js 14, React, Tailwind CSS, Lucide Icons, Prompt-Kit.
- **Backend**: FastAPI (Python 3.12+), SQLAlchemy, Pydantic.
- **Database**: PostgreSQL (Relational) + ChromaDB (Vector).
- **AI/ML**: Google Generative AI, Groq SDK, Sentence-Transformers.
