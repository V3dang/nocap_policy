# NoCap Policy
**Privacy-first insurance policy explanation using Gen Z slang and agentic RAG.**

NoCap Policy bridges the gap between dense financial jargon and the younger generation. It uses a multi-agent system to extract accurate facts from insurance documents and translate them into digestible, slang-infused insights paired with viral 9:16 short-form video reels.

## Tech Stack
* **Frontend:** Next.js, React, Tailwind CSS, Framer Motion
* **Runtime / Backend:** Node.js / Bun, Express
* **Orchestration:** LangGraph (Multi-agent workflow)
* **LLM:** Groq (Llama 3.3 70B)
* **Vector Database:** ChromaDB
* **Session Storage:** Redis
* **Local Embeddings:** Xenova/bge-small-en-v1.5
* **Media & TTS:** FFmpeg, ElevenLabs, Groq Whisper

## Infrastructure Setup
1. **ChromaDB:**
   ```bash
   bunx chroma run --path ./policy_data
   ```
2. **Redis:**
   ```bash
   sudo service redis-server start
   ```
3. **Environment:**
   Create a `.env` file in root:
   ```env
   GROQ_API_KEY=your_groq_api_key
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ```

## Installation & Running

### 1. Backend Server
```bash
bun install
npx tsx index.ts
```

### 2. Frontend Web App
```bash
cd frontend
npm install
npm run dev
```

## API Documentation

### 1. Ingest Policy
* **Endpoint:** `/api/upload`
* **Method:** `POST`
* **Body:** `form-data` with key `policy` (PDF file)

### 2. Generate Reel
* **Endpoint:** `/api/reel`
* **Method:** `POST`
* **Body:** `{"sessionId": "your-session-uuid"}`

### 3. Ask Questions
* **Endpoint:** `/api/ask`
* **Method:** `POST`
* **Body:**
  ```json
  {
    "qs": "What is my deductible?",
    "sessionId": "your-session-uuid"
  }
  ```

## Data Privacy
* Document embeddings are computed on host machine.
* Data is isolated per `sessionId` at the vector database layer.