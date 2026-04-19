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
import { LEGAL_ANALYST_SYSTEM_PROMPT, GENZ_TRANSLATOR_SYSTEM_PROMPT } from "../prompts/prompts";
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
  const latestmessage = state.messages.at(-1)
  const response = await analystmodel.invoke([    
    new SystemMessage(
      prompt
    ),
    latestmessage,
  ]);
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