# 🎓 SLCA - Smart Learning and Career Assistant

SLCA is an AI-powered personal learning and career growth platform designed to help students and professionals master their library of documents while bridging the gap between education and their next career milestone.

---

## 🌟 Transform Your Documents into Knowledge
- **AI-Powered Exploration**: Chat with your documents via an advanced RAG pipeline.
- **Automated Study Tools**: Instant summaries, quizzes, and study notes tailored to your documents.
- **Visual Intelligence**: Explore your knowledge using an interactive mind-map knowledge graph.
- **Career Accelerant**: AI-powered resume analysis and interview prep targeted to your skills.

## 🚀 Quick Setup

### Prerequisites
- **Python 3.12+**: For the backend logic and AI services.
- **Node.js 18+**: For the Next.js frontend dashboard.
- **PostgreSQL**: For persistent data storage.
- **Google AI & Groq (Optional)**: Keys for Gemini and fallback LLM services.

## 📁 Project Structure

### [Frontend](frontend/README.md)
Built with **Next.js 14**, featuring a sleek dashboard, real-time knowledge graph visualizations, and a responsive responsive chat explorer.

### [Backend](backend/README.md)
Powered by **FastAPI**, handling multi-format document parsing, ChromaDB vector storage, and an intelligent RAG fallback mechanism between Gemini and Groq.

---

## 📖 In-Depth Feature List
For a complete, exhaustive catalog of all features across our 8 core modules, check out our **[FEATURES.md](FEATURES.md)** guide.

---

## 🏗️ Getting Started

### 1. Backend Setup
```bash
cd backend
source venv/bin/activate
python run.py
```

### 2. Frontend Setup
```bash
cd frontend
npm run dev
```

Visit **http://localhost:3000** to begin your learning journey!
