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
import { Redis } from "ioredis"
import ffmpeg from "fluent-ffmpeg";
import * as googleTTS from "google-tts-api";
import Groq from "groq-sdk";
import { ElevenLabsClient, play } from '@elevenlabs/elevenlabs-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const elevenlabs = new ElevenLabsClient();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : new Redis();

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
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).send("Provide a sessionId bro");
  
  const sessionString = await redis.get(sessionId);
  if (!sessionString) return res.status(404).send("Session not found");
  
  console.log("1. Fetching policy context from Chroma...");
  const collection = await client.getCollection({ name: "nocap_policy" });
  const results = await collection.query({
  queryEmbeddings: [Array(384).fill(0)], 
    nResults: 5,
    where: { "sessionId": sessionId }
  });
  const retrievedContext = results.documents[0]?.join("\n\n") || "No info found.";
  
  console.log("2. Generating Brainrot Script & Dynamic Stats via Agent Nodes...");
  const [script, stats] = await Promise.all([
    generateReelScript(retrievedContext),
    extractPolicyStats(retrievedContext)
  ]);
  
  console.log("3. Generating TTS Audio...");
  const elevenLabsResponse = await elevenlabs.textToSpeech.convert(
    'JBFqnCBsd6RMkjVDRZzb',
    {
      text: script,
      modelId: 'eleven_turbo_v2',
      outputFormat:  'mp3_44100_128',
    }
  )
  
  const audioChunks = [];
  for await (const chunk of elevenLabsResponse) {
    audioChunks.push(chunk);
  }
  const audioBuffer = Buffer.concat(audioChunks);
  console.log(`[Debug] Audio saved: ${audioBuffer.length} bytes`);
  
  const tempAudioPath = path.resolve(__dirname, `uploads/audio_${sessionId}.mp3`);
  fs.writeFileSync(tempAudioPath, audioBuffer);
  
  console.log("4. Transcribing with Groq Whisper for Timestamps...");
  // We ask Groq for "verbose_json" so it gives us the exact start/end time of every phrase
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(tempAudioPath),
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json", 
  });
  
  console.log("5. Generating .srt Subtitle File...");
  const srtContent = generateSRT((transcription as any).segments || []);
  const srtPath = path.resolve(__dirname, `uploads/captions_${sessionId}.srt`);
  fs.writeFileSync(srtPath, srtContent);
  
  console.log("6. Forging the Brainrot Reel with Dynamic Captions...");
  const inputVideo = path.resolve(__dirname, 'minecraft_parkour.mp4');
  const outputVideo = path.resolve(__dirname, `uploads/reel_${sessionId}.mp4`);
  
  const srtPathEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  ffmpeg()
    .input(inputVideo)
    .input(tempAudioPath)
    .complexFilter([
      `subtitles='${srtPathEscaped}':force_style='Alignment=2,MarginV=80,FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=0,Bold=1'`
    ])
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
      console.log("W! Dynamic Reel generated successfully.");
      
      try {
        if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
        if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    
      res.json({
        message: "Reel forged",
        script: script,
        videoUrl: `/api/download/reel_${sessionId}.mp4`,
        stats: stats
      });
    })
    .on('error', (err) => {
      console.error("FFmpeg Error:", err);
      res.status(500).send("Error rendering video");
    });
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
