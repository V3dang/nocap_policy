# NoCap Policy
**Privacy-first insurance policy explanation using Gen Z slang and agentic RAG.**

NoCap Policy bridges the gap between dense financial jargon and the younger generation. It uses a multi-agent system to extract accurate facts from insurance documents and translate them into digestible, slang-infused insights.

## Tech Stack
* **Runtime:** Bun
* **Orchestration:** LangGraph (Multi-agent workflow)
* **LLM:** Groq (Llama 3.3 70B)
* **Vector Database:** ChromaDB (Local persistence)
* **Session Storage:** Redis (Persistent chat history)
* **Local Embeddings:** Xenova/bge-small-en-v1.5 (CPU-based)

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
   Create a `.env` file:
   ```env
   GROQ_API_KEY=your_groq_api_key
   ```

## Installation & Running
1. **Install dependencies:**
   ```bash
   bun install
   ```
2. **Start the server:**
   ```bash
   npx tsx index.ts
   ```

## API Documentation

### 1. Ingest Policy
* **Endpoint:** `/api/upload`
* **Method:** `POST`
* **Body:** `form-data` with key `policy` (PDF file)
* **Response:** Returns a `sessionId` required for queries.

### 2. Ask Questions
* **Endpoint:** `/api/ask`
* **Method:** `POST`
* **Body:** JSON
  ```json
  {
    "qs": "What is my deductible?",
    "sessionId": "your-session-uuid"
  }
  ```

## Agent Architecture
The system uses a stateful graph to separate logic:
1. **Retriever:** Fetches context from ChromaDB using metadata filters.
2. **Legal Analyst:** Extract dry, immutable facts from the retrieved text.
3. **Slang Translator:** Converts facts into Gen Z slang while maintaining accuracy.

## Data Privacy
* All document embedding is performed locally on the host machine.
* Data is filtered by `sessionId` at the database level to prevent cross-user leakage.
* Groq API calls utilize Llama-3.3-70b-versatile with a zero-data-retention focus.