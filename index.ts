import { fileURLToPath } from "url";
import path from "path";
import express from "express";
import multer from "multer";
// import { PDFParse } from "pdf-parse"; 
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import fs from 'fs'; 
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChromaClient } from "chromadb";
import { pipeline } from '@xenova/transformers';
import { agent, generateReelScript, extractPolicyStats } from "./agents/agent_nodes"; 
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import 'dotenv/config';
import { randomUUID } from "crypto";
import { Redis } from "ioredis";
import ffmpeg from "fluent-ffmpeg";
import Groq from "groq-sdk";
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const elevenlabs = new ElevenLabsClient();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Robust Redis setup for Cloud / Local
const redisUrl = process.env.REDIS_URL;
const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: redisUrl.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
    })
  : new Redis({ maxRetriesPerRequest: null });

redis.on("error", (err) => {
  console.error("[Redis Connection Warning]", err.message);
});

const client = new ChromaClient({ host: "localhost", port: 8000, ssl: false });
const uploadDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json());
const port = process.env.PORT || 8080;

// Lazy-loaded embedding pipeline to prevent 'extractor is not a function' errors
let extractorPromise: Promise<any> | null = null;
function getExtractor() {
  if (!extractorPromise) {
    console.log("Loading Xenova/bge-small-en-v1.5 embedding model...");
    extractorPromise = pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5')
      .then((model) => {
        console.log("Embedding model loaded successfully!");
        return model;
      })
      .catch((err) => {
        console.error("Failed to load embedding model:", err);
        extractorPromise = null;
        throw err;
      });
  }
  return extractorPromise;
}

// Warm up model in background
getExtractor().catch(() => {});

app.get("/", (req, res) => {
  res.send("NoCap Policy API Live!");
});

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getPolicyContext(sessionId: string, queryEmbedding?: number[], topK: number = 3): Promise<string> {
  // 1. Try ChromaDB
  try {
    const collection = await client.getCollection({ name: "nocap_policy" });
    const results = await collection.query({
      queryEmbeddings: queryEmbedding ? [queryEmbedding] : [Array(384).fill(0)],
      nResults: topK,
      where: { "sessionId": sessionId }
    });
    if (results.documents[0] && results.documents[0].length > 0) {
      return results.documents[0].join("\n\n");
    }
  } catch (err) {
    console.warn("ChromaDB query skipped, falling back to Redis storage");
  }

  // 2. Fallback to Redis stored document chunks
  try {
    const docString = await redis.get(`session:${sessionId}:docs`);
    if (!docString) return "No policy info found.";

    const data = JSON.parse(docString);
    const docs: string[] = data.documents || [];
    const embeddings: number[][] = data.embeddings || [];

    if (!queryEmbedding || embeddings.length === 0) {
      return docs.slice(0, topK).join("\n\n");
    }

    const scored = docs.map((doc, idx) => {
      const sim = cosineSimilarity(queryEmbedding, embeddings[idx] || []);
      return { doc, sim };
    });

    scored.sort((a, b) => b.sim - a.sim);
    return scored.slice(0, topK).map(item => item.doc).join("\n\n");
  } catch (e) {
    console.error("Error reading Redis doc context:", e);
    return "No policy info found.";
  }
}

app.post("/api/upload", upload.single('policy'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('Policy PDF not uploaded');
    }
    const extractor = await getExtractor();
    const sessionId: string = randomUUID();
    const loader = new PDFLoader(req.file.path);
    const rawDocs = await loader.load();
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const chunks = await splitter.splitDocuments(rawDocs);

    const ids: string[] = [];
    const embeddings: number[][] = [];
    const documents: string[] = [];
    const metadatas: Array<{ source: string, sessionId: string }> = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i]?.pageContent;
      if (!chunkText) continue;
      const output = await extractor(chunkText, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data) as number[];
      
      ids.push(`${sessionId}-chunk-${i}`);
      embeddings.push(vector);
      documents.push(chunkText);
      metadatas.push({ source: req.file.originalname, sessionId: sessionId });
    }
    
    // Store in ChromaDB if available
    try {
      const collection = await client.getOrCreateCollection({ name: `nocap_policy` });
      await collection.add({
        ids,
        embeddings: embeddings.length > 0 ? embeddings : undefined,
        documents,
        metadatas
      });
    } catch (chromaErr) {
      console.warn("ChromaDB unavailable, stored in Redis fallback.");
    }

    // Always store in Redis for resilience
    const docData = { documents, embeddings, metadatas };
    await redis.set(`session:${sessionId}:docs`, JSON.stringify(docData), 'EX', 60 * 60 * 24 * 7);

    const initialSessionData = {
      sessionId: sessionId,
      messages: []
    };
    await redis.set(sessionId, JSON.stringify(initialSessionData), 'EX', 60 * 60 * 24 * 7); 
    
    // Cleanup temporary uploaded PDF
    try {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch (e) {}

    res.json({
      message: "W",
      sessionId,
      totalChunks: chunks.length,
    });
  } catch (error) {
    console.error("Upload handler error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    const { qs, sessionId } = req.body;
    if (!qs) return res.status(400).send("Provide a message");
    if (!sessionId) return res.status(400).send("Provide a sessionId");
    
    const sessionString = await redis.get(sessionId);
    if (!sessionString) return res.status(404).send("Session not found or expired");
    
    const extractor = await getExtractor();
    const session = JSON.parse(sessionString);
    const output = await extractor(qs, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(output.data) as number[];
    
    const retrievedContext = await getPolicyContext(sessionId, queryEmbedding, 3);
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
      return res.status(500).send("No response generated");
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
      sources: retrievedContext
    });
  } catch (error) {
    console.error("Ask handler error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

function formatTime(seconds: number) {
  const date = new Date(seconds * 1000);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss},${ms}`;
}

function generateSRT(segments: any[]) {
  return segments.map((seg, i) => {
    return `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text.trim()}\n`;
  }).join('\n');
}

app.post("/api/reel", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).send("Provide a sessionId");
    
    const sessionString = await redis.get(sessionId);
    if (!sessionString) return res.status(404).send("Session not found");
    
    console.log("1. Fetching policy context...");
    const retrievedContext = await getPolicyContext(sessionId, undefined, 5);
    
    console.log("2. Generating Brainrot Script & Dynamic Stats via Agent Nodes...");
    const [script, stats] = await Promise.all([
      generateReelScript(retrievedContext),
      extractPolicyStats(retrievedContext)
    ]);

    const inputVideo = path.resolve(__dirname, 'minecraft_parkour.mp4');
    if (!fs.existsSync(inputVideo)) {
      console.warn("Background video minecraft_parkour.mp4 not found. Returning script & stats.");
      return res.json({
        message: "Script & Stats generated (video background missing)",
        script,
        videoUrl: null,
        stats
      });
    }

    console.log("3. Generating TTS Audio...");
    let audioBuffer: Buffer | null = null;
    try {
      const elevenLabsResponse = await elevenlabs.textToSpeech.convert(
        'JBFqnCBsd6RMkjVDRZzb',
        {
          text: script,
          modelId: 'eleven_turbo_v2',
          outputFormat: 'mp3_44100_128',
        }
      );
      
      const audioChunks = [];
      for await (const chunk of elevenLabsResponse) {
        audioChunks.push(chunk);
      }
      audioBuffer = Buffer.concat(audioChunks);
    } catch (ttsErr) {
      console.error("ElevenLabs TTS failed:", (ttsErr as Error).message);
    }

    if (!audioBuffer) {
      return res.json({
        message: "Script & Stats generated (TTS unavailable)",
        script,
        videoUrl: null,
        stats
      });
    }

    const tempAudioPath = path.resolve(__dirname, `uploads/audio_${sessionId}.mp3`);
    fs.writeFileSync(tempAudioPath, audioBuffer);
    
    console.log("4. Transcribing with Groq Whisper for Timestamps...");
    let srtPath: string | null = null;
    try {
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(tempAudioPath),
        model: "whisper-large-v3-turbo",
        response_format: "verbose_json", 
      });
      
      const srtContent = generateSRT((transcription as any).segments || []);
      srtPath = path.resolve(__dirname, `uploads/captions_${sessionId}.srt`);
      fs.writeFileSync(srtPath, srtContent);
    } catch (whisperErr) {
      console.warn("Whisper transcription skipped:", (whisperErr as Error).message);
    }
    
    console.log("5. Forging the Brainrot Reel with FFmpeg...");
    const outputVideo = path.resolve(__dirname, `uploads/reel_${sessionId}.mp4`);
    
    let ffCommand = ffmpeg().input(inputVideo).input(tempAudioPath);
    if (srtPath && fs.existsSync(srtPath)) {
      const srtPathEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      ffCommand = ffCommand.complexFilter([
        `subtitles='${srtPathEscaped}':force_style='Alignment=2,MarginV=80,FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=0,Bold=1'`
      ]);
    }

    ffCommand
      .outputOptions([
        '-map 0:v', 
        '-map 1:a', 
        '-shortest', 
        '-c:v libx264', 
        '-c:a aac', 
        '-y' 
      ])
      .save(outputVideo)
      .on('end', () => {
        console.log("Dynamic Reel generated successfully.");
        try {
          if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
          if (srtPath && fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
        } catch (e) {}
      
        res.json({
          message: "Reel forged",
          script,
          videoUrl: `/api/download/reel_${sessionId}.mp4`,
          stats
        });
      })
      .on('error', (err) => {
        console.error("FFmpeg Error:", err);
        res.json({
          message: "Script & Stats generated (FFmpeg rendering error)",
          script,
          videoUrl: null,
          stats
        });
      });
  } catch (error) {
    console.error("Reel handler error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/download/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const file = path.resolve(__dirname, `uploads/${filename}`);
  
  if (!fs.existsSync(file)) {
    return res.status(404).send("Reel not found on server.");
  }
  res.sendFile(file);
});

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
