import { ChatGroq } from "@langchain/groq"
import {
  StateGraph,
  StateSchema,
  MessagesValue,
  ReducedValue,
  START,
  END,
  type GraphNode,
} from "@langchain/langgraph";
import { z } from "zod/v4";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import { LEGAL_ANALYST_SYSTEM_PROMPT, GENZ_TRANSLATOR_SYSTEM_PROMPT, REEL_SCRIPT_PROMPT } from "../prompts/prompts";
import 'dotenv/config';

const GraphState = new StateSchema({
  messages: MessagesValue,
  context: z.string().default(""),
  legalfacts: z.string().default("")
});

const analystmodel = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0,
})

const translatormodel = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.7
})

const LegalAnalystNode: GraphNode<typeof GraphState> = async (state) => {
  const prompt = LEGAL_ANALYST_SYSTEM_PROMPT.replace("{context}", state.context)
  const latestmessage = state.messages.at(-1);
  const messagesToPass = latestmessage ? [new SystemMessage(prompt), latestmessage] : [new SystemMessage(prompt)];
  const response = await analystmodel.invoke(messagesToPass);
  return {
    legalfacts: response.content as string
  };
}

const SlangTranslatorNode: GraphNode<typeof GraphState> = async (state) => {
  const prompt = GENZ_TRANSLATOR_SYSTEM_PROMPT
  const facts = state.legalfacts
  if (facts.includes("INFORMATION_NOT_FOUND")) {
    return {
      messages: [new AIMessage("Bro, I scanned the paperwork and that's literally not in your policy, no cap. You're cooked if you try to claim that without checking with your provider.")]
    }
  }
  const response = await translatormodel.invoke([
    new SystemMessage(
      prompt,
    ),
    new SystemMessage(`Here are the raw facts to translate:\n${facts}`)
  ])
  return {
    messages: [response]
  }
}

export const agent = new StateGraph(GraphState)
  .addNode("LegalAnalyst", LegalAnalystNode)
  .addNode("SlangTranslator", SlangTranslatorNode)
  .addEdge(START, "LegalAnalyst")
  .addEdge("LegalAnalyst", "SlangTranslator")
  .addEdge("SlangTranslator", END)
  .compile();

export const generateReelScript = async (context: string) => {
  const prompt = REEL_SCRIPT_PROMPT.replace("{context}", context)
  const response = await translatormodel.invoke([
    new SystemMessage(prompt)
  ])
  return response.content as string
}

export const extractPolicyStats = async (context: string) => {
  const prompt = `Analyze this insurance policy text and extract or evaluate the following 3 metrics:
1. "deductible": Deductible or out-of-pocket limit found (e.g. "$500 Active", "$1,000 Limit", "No Deductible").
2. "coverageScore": A coverage score rating out of 100 based on coverage thoroughness (e.g. "89 / 100").
3. "susLevel": Gen Z risk assessment of hidden clauses/fine print (e.g. "Low-Key Chill", "Mid-Key Sus", "Ultra Cooked").

Return ONLY valid JSON with keys "deductible", "coverageScore", and "susLevel". No backticks or extra text.`;

  try {
    const response = await analystmodel.invoke([
      new SystemMessage(prompt),
      new SystemMessage(`Policy context:\n${context}`)
    ]);
    const text = (response.content as string).replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    return {
      deductible: String(parsed.deductible ?? "Analyzed"),
      coverageScore: String(parsed.coverageScore ?? "85 / 100"),
      susLevel: String(parsed.susLevel ?? "Low-Key Chill")
    };
  } catch (err) {
    console.error("Error extracting policy stats:", err);
    return {
      deductible: "Active",
      coverageScore: "85 / 100",
      susLevel: "Low-Key Chill"
    };
  }
};