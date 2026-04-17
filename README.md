# Clinivue: Your Health Guide

Clinivue is an AI-powered healthcare decision-support platform designed to help patients in India navigate their medical journey. It provides real-time cost estimates for medical procedures, recommends top-rated local hospitals, and analyzes lab reports—all wrapped in a stunning, user-friendly interface.

## ✨ Features

- **💬 AI Healthcare Assistant**: Chat naturally about your symptoms, treatments, or medical queries. The AI extracts your intent (procedure, location, budget) to provide tailored advice.
- **💰 Live Cost Estimates**: Powered by Google Gemini with live Google Search grounding (and a seamless fallback to Groq's Llama 3.3 70B), the app fetches real-time hospital procedure costs in your city.
- **🏥 Hospital Recommendations**: Automatically detects your city and recommends the best local hospitals based on clinical quality, affordability, and reputation.
- **🔬 Lab Report Analyzer**: Upload your blood test or CBC reports. The app uses OCR to extract parameters, compares them against standard reference ranges, and flags abnormal values with safety-guardrailed Ayurveda and home remedy suggestions.
- **🔒 Encrypted Search History**: All your chats, cost queries, and lab reports are saved to your browser's local storage using AES-256 end-to-end encryption.
- **🔐 Secure Authentication**: Firebase Google Sign-In ensures that your encrypted data is strictly tied to your account.

## 🛠️ Technology Stack

- **Frontend**: React, Vite, Tailwind CSS v4, Framer Motion, Lucide Icons
- **Backend**: FastAPI (Python), Uvicorn
- **AI / ML**: 
  - Google Gemini 2.0 Flash / 2.5 Flash (with Google Search Grounding)
  - Groq Llama 3.3 70B (High-speed fallback engine)
- **Auth & Security**: Firebase Auth, Crypto-js (AES-256)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- Google AI Studio API Key (for Gemini)
- Groq API Key (for Fallback)
- Firebase Project configured for Web & Google Sign-In

### 1. Clone the repository
```bash
git clone https://github.com/Adityapandey6969/Clinivue.git
cd Clinivue
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the `backend` directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

Start the FastAPI server:
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Setup
Open a new terminal.
```bash
cd frontend
npm install
```

Ensure your Firebase configuration is set in `frontend/src/lib/firebase.ts`.

Start the Vite development server:
```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

## ⚠️ Disclaimer
Clinivue is a **decision-support tool only** and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.
