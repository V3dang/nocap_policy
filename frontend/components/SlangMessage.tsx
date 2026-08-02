"use client";

import { motion } from "framer-motion";
import { Copy, Sparkles } from "lucide-react";

type SlangMessageProps = {
  text: string;
  isAI?: boolean;
};

export default function SlangMessage({ text, isAI = false }: SlangMessageProps) {
  const copyToClipboard = async () => {
    if (!isAI || typeof window === "undefined") return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  };

  if (!isAI) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className="ml-auto max-w-[88%] rounded-2xl brutal-border border-white/20 bg-white/5 px-4 py-3 text-sm text-white"
      >
        {text}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      className="max-w-[92%] rounded-2xl border border-neon/60 bg-neon/20 px-4 py-3 shadow-purpleGlow backdrop-blur-md"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-lime">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-lime/40 bg-black/60">
          <Sparkles size={15} strokeWidth={2.75} />
        </div>
        Gen Z Advisor
      </div>

      <p className="text-sm leading-relaxed text-white">{text}</p>

      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={copyToClipboard}
        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-lime/40 bg-black/45 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-lime transition hover:bg-black/70"
      >
        <Copy size={14} strokeWidth={2.75} />
        Copy for Group Chat
      </motion.button>
    </motion.div>
  );
}
