import express from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse"; 
import fs from 'fs'; 
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChromaClient } from "chromadb";
import { pipeline } from '@xenova/transformers';
import { ChatGroq } from "@langchain/groq"
import { agent } from "./agents/agent_nodes"; 
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import 'dotenv/config';
import { randomUUID } from "crypto";

const client = new ChromaClient();
const upload = multer({ 'dest': 'uploads/' })

const app = express();
app.use(express.json());
const port = 8080;

type SessionState = {
  collectionName: string;
  messages: Array<HumanMessage | AIMessage>;
  contextDocs: Map<string, string>;
};

const sessions = new Map<string, SessionState>();

const llm = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    maxTokens: undefined,
    maxRetries: 2,
})

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
  const databuffer = new Uint8Array(fs.readFileSync(req.file.path));
  const data = new PDFParse(databuffer);
  const text = await data.getText();
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 })
  const chunks = await splitter.createDocuments([text.text])

  const ids: string[] = []
  const embeddings: number[][] = []
  const documents: string[] = []
  const metadatas: Array<{ source: string }> = []
  
  for (let i = 0; i < chunks.length; i++){
    const chunkText = chunks[i]?.pageContent
    if (!chunkText) continue;
    const output = await extractor(chunkText, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data) as number[];
    
    ids.push(`${req.file.filename}-chunk-${i}`);
    embeddings.push(vector);
    documents.push(chunkText);
    metadatas.push({ source: req.file.originalname });
  }
  
  const sessionId = randomUUID();
  const collectionName = `nocap_policy_${sessionId}`;
  const collection = await client.createCollection({
    name: collectionName,
  });
  
  await collection.add({
    ids: ids,
    embeddings: embeddings,
    documents: documents,
    metadatas: metadatas
  })
  
  sessions.set(sessionId, {
    collectionName,
    messages: [],
    contextDocs: new Map<string, string>(),
  });

  res.json({
    sessionId,
    totalChunks: chunks.length,
    sampleChunk: chunks[0]
  })
});

app.post("/api/ask", async (req, res) => {
  const { qs, sessionId } = req.body
  if (!qs) return res.status(400).send("Provide a message dawg")
  if (!sessionId) return res.status(400).send("Provide a sessionId")
  const session = sessions.get(sessionId)
  if (!session) return res.status(404).send("Session not found")
  
  const output = await extractor(qs, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(output.data) as number[];
  
  const collection = await client.getOrCreateCollection({ name: session.collectionName });
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: 3, 
  });

  const resultDocs = (results.documents[0] ?? []) as string[];
  const resultIds = (results.ids[0] ?? []) as string[];
  for (let i = 0; i < resultDocs.length; i++) {
    const docId = resultIds[i];
    const docText = resultDocs[i];
    if (docId && docText) {
      session.contextDocs.set(docId, docText);
    }
  }
  const retrievedContext = Array.from(session.contextDocs.values()).join("\n\n");
  const nextMessages = [...session.messages, new HumanMessage(qs)];
  const finalState = await agent.invoke({
    messages: nextMessages,
    context: retrievedContext
  });

  const finalMessage = finalState.messages[finalState.messages.length - 1];
  if (!finalMessage) {
    return res.status(500).send("No response generated")
  }
  session.messages = [...nextMessages, new AIMessage(finalMessage.content as string)];
  res.json({
    answer: finalMessage.content,
    sources: results.metadatas[0]
  });
})

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
