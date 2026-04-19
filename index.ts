import express from "express";
import multer from "multer";
// import { PDFParse } from "pdf-parse"; 
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import fs from 'fs'; 
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChromaClient } from "chromadb";
import { pipeline } from '@xenova/transformers';
import { agent } from "./agents/agent_nodes"; 
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import 'dotenv/config';
import { randomUUID } from "crypto";
import { Redis } from "ioredis"

const redis = new Redis()

const client = new ChromaClient({ path: "http://localhost:8000" });
const upload = multer({ 'dest': 'uploads/' })

const app = express();
app.use(express.json());
const port = 8080;

let extractor: any;
async function loadModel() {
  extractor = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');
  console.log("Model loaded successfully!");
}
loadModel();

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/api/upload", upload.single('policy'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('Policy not uploaded');
  }
  const sessionId: string = randomUUID();
  const loader = new PDFLoader(req.file.path);
  const rawDocs = await loader.load();
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 })
  const chunks = await splitter.splitDocuments(rawDocs)

  const ids: string[] = []
  const embeddings: number[][] = []
  const documents: string[] = []
  const metadatas: Array<{ source: string, sessionId: string }> = []
  
  for (let i = 0; i < chunks.length; i++){
    const chunkText = chunks[i]?.pageContent
    if (!chunkText) continue;
    const output = await extractor(chunkText, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data) as number[];
    
    ids.push(`${sessionId}-chunk-${i}`);
    embeddings.push(vector);
    documents.push(chunkText);
    metadatas.push({ source: req.file.originalname, sessionId: sessionId });
  }
  
  const collectionName = `nocap_policy`;
  const collection = await client.getOrCreateCollection({
    name: collectionName,
  });
  
  await collection.add({
    ids: ids,
    embeddings: embeddings,
    documents: documents,
    metadatas: metadatas
  })
  
  const initialSessionData = {
    sessionId: sessionId,
    messages: []
  };
  
  await redis.set(sessionId, JSON.stringify(initialSessionData), 'EX', 60 * 60 * 24 * 7); 
  
  res.json({
    message: "W",
    sessionId,
    totalChunks: chunks.length,
  })
});

app.post("/api/ask", async (req, res) => {
  const { qs, sessionId } = req.body
  if (!qs) return res.status(400).send("Provide a message dawg")
  if (!sessionId) return res.status(400).send("Provide a sessionId")
  const sessionString = await redis.get(sessionId);
  if (!sessionString) return res.status(404).send("Session not found or expired");
  
  const session = JSON.parse(sessionString);
  const output = await extractor(qs, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(output.data) as number[];
  
  const collection = await client.getCollection({ name: "nocap_policy" });
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: 3, 
    where: { "sessionId": sessionId }
  });

  const retrievedContext = results.documents[0]?.join("\n\n") || "No relevant info found.";
  const hydratedMessages = session.messages.map((msg: any) => {
    return msg.role === "user" 
    ? new HumanMessage(msg.content) 
    : new AIMessage(msg.content);
  });
  const nextMessages = [...hydratedMessages, new HumanMessage(qs)];
  const finalState = await agent.invoke({
    messages: nextMessages,
    context: retrievedContext
  });

  const finalMessage = finalState.messages[finalState.messages.length - 1];
  if (!finalMessage) {
    return res.status(500).send("No response generated")
  }
  
  const updatedMessages = [
    ...session.messages, 
    { role: "user", content: qs }, 
    { role: "ai", content: finalMessage.content as string }
  ];
  
  await redis.set(sessionId, JSON.stringify({ 
    sessionId: sessionId, 
    messages: updatedMessages 
  }), 'EX', 60 * 60 * 24 * 7);
  
  res.json({
    answer: finalMessage.content,
    sources: results.metadatas[0]
  });
})

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
