import express from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse"; 
import fs from 'fs'; 
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChromaClient } from "chromadb";
import { pipeline } from '@xenova/transformers';

const client = new ChromaClient();
const upload = multer({ 'dest': 'uploads/' })

const app = express();
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
  const databuffer = new Uint8Array(fs.readFileSync(req.file.path));
  const data = new PDFParse(databuffer);
  const text = await data.getText();
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 })
  const chunks = await splitter.createDocuments([text.text])

  const ids = []
  const embeddings = []
  const documents = []
  const metadatas = []
  
  for (let i = 0; i < chunks.length; i++){
    const chunkText = chunks[i]?.pageContent
    const output = await extractor(chunkText, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);
    
    ids.push(`${req.file.filename}-chunk-${i}`);
    embeddings.push(vector);
    documents.push(chunkText);
    metadatas.push({ source: req.file.originalname });
  }
  
  const collection = await client.createCollection({
    name: "nocap_policy_collection",
  });
  
  await collection.add({
    ids: ids,
    embeddings: embeddings,
    documents: documents,
    metadatas: metadatas
  })
  
  res.json({
    message: "W!",
    totalChunks: chunks.length,
    sampleChunk: chunks[0]
  })
});

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});