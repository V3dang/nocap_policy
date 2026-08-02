"use client";

import { motion } from "framer-motion";
import { Activity, FileUp, Loader2, MessageCircle, ShieldCheck, Siren, UploadCloud, WalletCards, CheckCircle2, Play, Download, Smartphone } from "lucide-react";
import { type ChangeEvent, type DragEventHandler, useMemo, useState } from "react";
import SlangMessage from "@/components/SlangMessage";

type Message = {
  id: number;
  text: string;
  isAI?: boolean;
};

type PolicyStats = {
  deductible: string;
  coverageScore: string;
  susLevel: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export default function DashboardPage() {
  const [dragActive, setDragActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [policyFileName, setPolicyFileName] = useState<string | null>(null);
  const [policyStats, setPolicyStats] = useState<PolicyStats | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [reelScript, setReelScript] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scanLabel = useMemo(() => {
    if (isUploading) return "Uploading your policy...";
    if (isScanning) return "Forging Reel & Decoding Policy Tea...";
    if (policyFileName) return `Active Policy: ${policyFileName}`;
    return "Drop your PDF here to decode the policy tea";
  }, [isScanning, isUploading, policyFileName]);

  const statCards = useMemo(() => [
    {
      label: "Deductible Status",
      value: policyStats?.deductible ?? (isScanning || isUploading ? "Analyzing..." : "No Policy Uploaded"),
      icon: WalletCards,
      glow: "lime",
    },
    {
      label: "Coverage Score",
      value: policyStats?.coverageScore ?? (isScanning || isUploading ? "Evaluating..." : "-- / 100"),
      icon: ShieldCheck,
      glow: "neon",
    },
    {
      label: "Sus Level",
      value: policyStats?.susLevel ?? (isScanning || isUploading ? "Scanning..." : "Awaiting Upload"),
      icon: Siren,
      glow: "lime",
    },
  ], [policyStats, isScanning, isUploading]);

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
    setPolicyFileName(file.name);
    setPolicyStats(null);
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

      const uploadData: any = await uploadResponse.json();
      setSessionId(uploadData.sessionId);

      const reelResponse = await fetch(`${API_BASE}/api/reel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: uploadData.sessionId }),
      });

      if (!reelResponse.ok) {
        throw new Error("Reel generation failed. Try again.");
      }

      const reelData: any = await reelResponse.json();
      const reelPath = reelData.videoUrl ?? null;
      if (reelPath) {
        setReelUrl(reelPath.startsWith("http") ? reelPath : `${API_BASE}${reelPath}`);
      } else {
        setReelUrl(null);
      }
      setReelScript(reelData.script ?? null);
      if (reelData.stats) {
        setPolicyStats({
          deductible: reelData.stats.deductible ?? "Analyzed",
          coverageScore: reelData.stats.coverageScore ?? "85 / 100",
          susLevel: reelData.stats.susLevel ?? "Low-Key Chill",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setErrorMessage(message);
    } finally {
      setIsUploading(false);
      setIsScanning(false);
    }
  };

  const handleFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
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

      const data: any = await response.json();
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
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 md:px-10 md:py-8">
      <header className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end md:mb-8">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-lime">NoCap Policy</p>
          <h1 className="font-[var(--font-header)] text-3xl sm:text-5xl md:text-6xl leading-[1.05] text-white">
            Policy Dashboard
          </h1>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          className="rounded-2xl border border-neon/60 bg-neon/30 px-3.5 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-purpleGlow"
        >
          Live Mode
        </motion.button>
      </header>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-12">
        {/* Upload Card */}
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 22 }}
          className="glass-card brutal-border md:col-span-7 rounded-brutal p-4 sm:p-5"
        >
          <div
            onDragOver={(event: any) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDropPdf}
            className={`relative flex min-h-[220px] sm:min-h-[280px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 sm:p-6 text-center transition ${
              dragActive ? "border-lime shadow-glow bg-lime/5" : "border-white/25"
            }`}
          >
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFilePick}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {policyFileName && !isScanning && !isUploading ? (
              <CheckCircle2 className="mb-3 text-lime animate-bounce" size={36} strokeWidth={2.5} />
            ) : (
              <FileUp className="mb-3" size={32} strokeWidth={2.75} color="#CCFF00" />
            )}
            <p
              className={`font-[var(--font-header)] text-lg sm:text-2xl ${
                isScanning ? "animate-pulseScan text-lime" : "text-white"
              }`}
            >
              {scanLabel}
            </p>
            <p className="mt-2 max-w-md text-[11px] sm:text-xs uppercase tracking-[0.14em] text-white/65">
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

        {/* Stats Card */}
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 22, delay: 0.05 }}
          className="glass-card brutal-border md:col-span-5 rounded-brutal p-4 sm:p-5"
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
                  className={`rounded-2xl border p-3.5 sm:p-4 ${
                    card.glow === "lime"
                      ? "border-lime/45 bg-lime/10 shadow-glow"
                      : "border-neon/50 bg-neon/15 shadow-purpleGlow"
                  }`}
                >
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] sm:text-xs uppercase tracking-[0.14em] text-white/80">
                    <Icon size={16} strokeWidth={2.75} /> {card.label}
                  </div>
                  <p className="font-[var(--font-header)] text-xl sm:text-2xl leading-none text-white">{card.value}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.article>

        {/* Policy Reel Video Section */}
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 22, delay: 0.08 }}
          className="glass-card brutal-border md:col-span-12 rounded-brutal p-4 sm:p-5"
        >
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.17em] text-lime">
            <Smartphone size={16} strokeWidth={2.75} /> Policy Reel Summary
          </div>
          
          <div className="grid gap-6 lg:grid-cols-[450px_1fr] items-start">
            {/* Phone Reel Frame */}
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/60 p-3 sm:p-4">
              {reelUrl ? (
                <div className="relative w-full max-w-[280px] sm:max-w-[310px] aspect-[9/16] rounded-[2rem] border-4 border-white/20 bg-black overflow-hidden shadow-purpleGlow flex items-center justify-center">
                  <video
                    key={reelUrl}
                    className="h-full w-full object-contain rounded-[1.8rem]"
                    controls
                    autoPlay
                    playsInline
                    src={reelUrl}
                  />
                </div>
              ) : (
                <div className="relative w-full max-w-[280px] sm:max-w-[310px] aspect-[9/16] rounded-[2rem] border-2 border-dashed border-white/20 bg-black/40 p-4 flex flex-col items-center justify-center text-center gap-3">
                  <Loader2 className={isScanning || isUploading ? "animate-spin text-lime" : "text-white/30"} size={32} strokeWidth={2.5} />
                  <p className="text-xs uppercase tracking-[0.15em] text-white/70 px-2">
                    {isUploading ? "Uploading policy PDF..." : isScanning ? "Forging the 9:16 Brainrot Reel with dynamic captions & TTS..." : "Upload a policy PDF above to forge your TikTok/Reel"}
                  </p>
                </div>
              )}
            </div>

            {/* Reel Script & Download Action */}
            <div className="rounded-2xl border border-white/10 bg-black/55 p-4 sm:p-5 flex flex-col justify-between min-h-[300px] sm:min-h-[480px]">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.15em] text-lime font-semibold">Brainrot Voiceover Script</span>
                  {reelUrl && <span className="text-[10px] uppercase tracking-[0.12em] bg-lime/20 text-lime px-2 py-0.5 rounded-md font-semibold">Ready to post</span>}
                </div>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-white/90 max-h-[340px] overflow-y-auto">
                  {reelScript ??
                    "Your AI-generated policy reel script will land here after upload. It's written in authentic slang, timed for 40 seconds, and paired with Minecraft parkour background visuals."}
                </div>
              </div>

              {reelUrl && (
                <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3">
                  <a
                    href={reelUrl}
                    download="nocap_policy_reel.mp4"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-lime/40 bg-lime/20 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-lime hover:bg-lime/30 transition text-center shadow-glow"
                  >
                    <Download size={16} strokeWidth={2.5} /> Download Vertical Reel MP4
                  </a>
                </div>
              )}
            </div>
          </div>
        </motion.article>

        {/* Slang Chat Section */}
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 22, delay: 0.1 }}
          className="glass-card brutal-border md:col-span-12 rounded-brutal p-4 sm:p-5"
        >
          <div className="mb-4 text-xs uppercase tracking-[0.17em] text-lime font-semibold">The Slang-Chat Advisor</div>
          <div className="space-y-3 rounded-2xl border border-white/15 bg-black/40 p-3 sm:p-4 max-h-[380px] overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-xs uppercase tracking-[0.14em] text-white/60 text-center py-4">
                {sessionId ? "Ask anything about your uploaded policy. We keep it 100, no cap." : "Upload a policy first, then ask anything. We keep it 100."}
              </p>
            )}
            {messages.map((message) => (
              <SlangMessage key={message.id} text={message.text} isAI={message.isAI} />
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/60">
                <Loader2 size={14} strokeWidth={2.5} className="animate-spin text-lime" />
                Gen Z advisor is cooking...
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <input
              value={chatInput}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setChatInput(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendMessage();
              }}
              placeholder={sessionId ? "Ask about deductible, claims, exclusions..." : "Upload a policy PDF first to chat..."}
              disabled={!sessionId || chatLoading}
              className="flex-1 rounded-2xl border border-white/20 bg-black/50 px-4 py-3 text-xs sm:text-sm text-white placeholder:text-white/40 focus:border-lime/60 focus:outline-none disabled:opacity-50"
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleSendMessage}
              disabled={!sessionId || chatLoading || !chatInput.trim()}
              className="rounded-2xl border border-lime/40 bg-lime/20 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-lime transition disabled:cursor-not-allowed disabled:opacity-50 w-full sm:w-auto"
            >
              Send
            </motion.button>
          </div>
        </motion.article>
      </section>
    </main>
  );
}
