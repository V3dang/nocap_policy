"use client";

import { motion } from "framer-motion";
import { Activity, FileUp, ShieldCheck, Siren, WalletCards } from "lucide-react";
import { type DragEventHandler, useMemo, useState } from "react";
import SlangMessage from "@/components/SlangMessage";

type Message = {
  id: number;
  text: string;
  isAI?: boolean;
};

const statCards = [
  { label: "Deductible Status", value: "$500 Active", icon: WalletCards, glow: "lime" },
  { label: "Coverage Score", value: "89 / 100", icon: ShieldCheck, glow: "neon" },
  { label: "Sus Level", value: "Low-Key Chill", icon: Siren, glow: "lime" },
] as const;

export default function DashboardPage() {
  const [dragActive, setDragActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [messages] = useState<Message[]>([
    { id: 1, text: "Translate this policy into plain slang pls." },
    {
      id: 2,
      isAI: true,
      text: "Bet. Your plan is basically stacked for major oops moments, but routine stuff still hits your deductible first. Coverage is high, loopholes are mid, and your risk is low-key manageable.",
    },
  ]);

  const scanLabel = useMemo(() => {
    if (isScanning) return "Scanning for the W...";
    return "Drop your PDF here to decode the policy tea";
  }, [isScanning]);

  const onDropPdf: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || file.type !== "application/pdf") return;

    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 2400);
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
          transition={{ type: "spring", stiffness: 170, damping: 22, delay: 0.1 }}
          className="glass-card brutal-border md:col-span-12 rounded-brutal p-5"
        >
          <div className="mb-4 text-xs uppercase tracking-[0.17em] text-lime">The Slang-Chat</div>
          <div className="space-y-3 rounded-2xl border border-white/15 bg-black/40 p-4">
            {messages.map((message) => (
              <SlangMessage key={message.id} text={message.text} isAI={message.isAI} />
            ))}
          </div>
        </motion.article>
      </section>
    </main>
  );
}
