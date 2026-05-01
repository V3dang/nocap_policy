"use client";

import { motion } from "framer-motion";
import { Activity, FileUp, Loader2, MessageCircle, ShieldCheck, Siren, UploadCloud, WalletCards } from "lucide-react";
import { type ChangeEvent, type DragEventHandler, useMemo, useState } from "react";
import SlangMessage from "@/components/SlangMessage";

type Message = {
  id: number;
  text: string;
  isAI?: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

const statCards = [
  { label: "Deductible Status", value: "$500 Active", icon: WalletCards, glow: "lime" },
  { label: "Coverage Score", value: "89 / 100", icon: ShieldCheck, glow: "neon" },
  { label: "Sus Level", value: "Low-Key Chill", icon: Siren, glow: "lime" },
] as const;

export default function DashboardPage() {
  const [dragActive, setDragActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [reelScript, setReelScript] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scanLabel = useMemo(() => {
    if (isUploading) return "Uploading your policy...";
    if (isScanning) return "Scanning for the W...";
    return "Drop your PDF here to decode the policy tea";
  }, [isScanning, isUploading]);

  const onDropPdf: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || file.type !== "application/pdf") return;
    handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    setErrorMessage(null);
    setIsUploading(true);
    setIsScanning(true);
    setReelUrl(null);
    setReelScript(null);
    setMessages([]);

    try {
      const formData = new FormData();
      formData.append("policy", file);

      const uploadResponse = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed. Try again with a valid PDF.");
      }

      const uploadData = await uploadResponse.json();
      setSessionId(uploadData.sessionId);

      const reelResponse = await fetch(`${API_BASE}/api/reel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: uploadData.sessionId }),
      });

      if (!reelResponse.ok) {
        throw new Error("Reel generation failed. Try again.");
      }

      const reelData = await reelResponse.json();
      const reelPath = reelData.videoUrl ?? null;
      if (reelPath) {
        setReelUrl(reelPath.startsWith("http") ? reelPath : `${API_BASE}${reelPath}`);
      } else {
        setReelUrl(null);
      }
      setReelScript(reelData.script ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setErrorMessage(message);
    } finally {
      setIsUploading(false);
      setTimeout(() => setIsScanning(false), 800);
    }
  };

  const handleFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setErrorMessage("Upload a PDF policy to continue.");
      return;
    }
    handleUpload(file);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !sessionId || chatLoading) return;

    const newMessage: Message = {
      id: Date.now(),
      text: chatInput,
    };
    setMessages((prev) => [...prev, newMessage]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qs: newMessage.text, sessionId }),
      });

      if (!response.ok) {
        throw new Error("Failed to get an answer.");
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: data.answer ?? "No response received.",
          isAI: true,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: message,
          isAI: true,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 pb-10 pt-8 md:px-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-lime">NoCap Policy</p>
          <h1 className="font-[var(--font-header)] text-4xl leading-[1.05] text-white md:text-6xl">
            Policy Dashboard
          </h1>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          className="rounded-2xl border border-neon/60 bg-neon/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-purpleGlow"
        >
          Live Mode
        </motion.button>
      </header>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-12">
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 22 }}
          className="glass-card brutal-border md:col-span-7 rounded-brutal p-5"
        >
          <div
            onDragOver={(event: any) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDropPdf}
            className={`relative flex min-h-[280px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
              dragActive ? "border-lime shadow-glow" : "border-white/25"
            }`}
          >
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFilePick}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            <FileUp className="mb-3" size={32} strokeWidth={2.75} color="#CCFF00" />
            <p
              className={`font-[var(--font-header)] text-xl md:text-2xl ${
                isScanning ? "animate-pulseScan text-lime" : "text-white"
              }`}
            >
              {scanLabel}
            </p>
            <p className="mt-2 max-w-md text-xs uppercase tracking-[0.14em] text-white/65">
              Drag a policy PDF and we will break down the receipts in under 3 seconds.
            </p>
            {errorMessage && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-red-400">
                {errorMessage}
              </p>
            )}
            <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/70">
              <UploadCloud size={14} strokeWidth={2.5} />
              Tap to upload manually
            </div>
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 22, delay: 0.05 }}
          className="glass-card brutal-border md:col-span-5 rounded-brutal p-5"
        >
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-lime">
            <Activity size={16} strokeWidth={2.75} /> Policy Stats
          </div>

          <div className="grid grid-cols-1 gap-3">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.label}
                  whileHover={{ y: -2 }}
                  className={`rounded-2xl border p-4 ${
                    card.glow === "lime"
                      ? "border-lime/45 bg-lime/10 shadow-glow"
                      : "border-neon/50 bg-neon/15 shadow-purpleGlow"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/80">
                    <Icon size={16} strokeWidth={2.75} /> {card.label}
                  </div>
                  <p className="font-[var(--font-header)] text-2xl leading-none text-white">{card.value}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 22, delay: 0.08 }}
          className="glass-card brutal-border md:col-span-12 rounded-brutal p-5"
        >
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.17em] text-lime">
            <MessageCircle size={16} strokeWidth={2.75} /> Policy Reel Summary
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-white/10 bg-black/55 p-4">
              {reelUrl ? (
                <video
                  className="h-[340px] w-full rounded-2xl border border-white/15 object-cover"
                  controls
                  src={reelUrl}
                />
              ) : (
                <div className="flex h-[340px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-black/40 text-center">
                  <Loader2 className={isUploading ? "animate-spin" : ""} size={24} strokeWidth={2.5} />
                  <p className="text-xs uppercase tracking-[0.15em] text-white/70">
                    {isUploading ? "Forging the reel..." : "Upload a policy to generate the reel"}
                  </p>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/55 p-4">
              <div className="mb-2 text-xs uppercase tracking-[0.15em] text-white/60">Reel Script</div>
              <p className="text-sm leading-relaxed text-white/85">
                {reelScript ??
                  "Your policy reel script will land here after upload. We keep it snappy, summary-only, and ready to share."}
              </p>
            </div>
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 22, delay: 0.1 }}
          className="glass-card brutal-border md:col-span-12 rounded-brutal p-5"
        >
          <div className="mb-4 text-xs uppercase tracking-[0.17em] text-lime">The Slang-Chat</div>
          <div className="space-y-3 rounded-2xl border border-white/15 bg-black/40 p-4">
            {messages.length === 0 && (
              <p className="text-xs uppercase tracking-[0.14em] text-white/60">
                Upload a policy first, then ask anything. We keep it 100.
              </p>
            )}
            {messages.map((message) => (
              <SlangMessage key={message.id} text={message.text} isAI={message.isAI} />
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/60">
                <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
                Gen Z advisor is cooking...
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about deductible, claims, exclusions..."
              className="flex-1 rounded-2xl border border-white/20 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-lime/60 focus:outline-none"
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleSendMessage}
              disabled={!sessionId || chatLoading}
              className="rounded-2xl border border-lime/40 bg-lime/20 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-lime transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </motion.button>
          </div>
        </motion.article>
      </section>
    </main>
  );
}
