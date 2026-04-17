import express from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse"; 
import fs from 'fs'; 
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChromaClient } from "chromadb";

const client = new ChromaClient();
const upload = multer({ 'dest': 'uploads/' })

const app = express();
const port = 8080;

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

  const collection = await client.createCollection({
    name: "nocap_policy_collection",
  });
  
  res.json({
    message: "Chunking Done",
    totalChunks: chunks.length,
    sampleChunk: chunks[0]
  })
});

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});