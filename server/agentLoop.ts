// server/agentLoop.ts
//
// Shared while-loop executor for all agents.
// Zero business logic — just routes messages between OpenAI and tool handlers.

import OpenAI from "openai";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";

const openai = new OpenAI({
  apiKey: process.env.AURELIA_LLM_API_KEY,
});

export interface AgentResult {
  reply: string;
  conversationHistory: ChatCompletionMessageParam[];
  action?: { type: "navigate"; to: string };
}

export async function runAgentLoop(opts: {
  systemPrompt: string;
  tools: ChatCompletionTool[];
  toolHandlers: Record<string, (args: any) => Promise<any>>;
  conversationHistory: ChatCompletionMessageParam[];
  navigationTrigger?: { toolName: string; navigateTo: string };
  label?: string;
}): Promise<AgentResult> {
  const {
    systemPrompt,
    tools,
    toolHandlers,
    conversationHistory,
    navigationTrigger,
    label = "agent",
  } = opts;

  const MAX_ITERATIONS = 20;
  let iteration = 0;

  while (true) {
    if (++iteration > MAX_ITERATIONS) {
      return {
        reply: "I hit a processing limit. Could you try rephrasing your request?",
        conversationHistory,
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
      ],
      tools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;

    if (message.tool_calls?.length) {
      console.log(
        `[${label}] iter=${iteration} tool_calls=[${message.tool_calls.map((tc: any) => tc.function?.name).join(", ")}]`
      );
    } else {
      console.log(
        `[${label}] iter=${iteration} text_reply (${(message.content || "").length} chars)`
      );
    }

    conversationHistory.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      // Check for navigation trigger in conversation history
      let action: AgentResult["action"] | undefined;
      if (navigationTrigger) {
        const triggered = conversationHistory.some(
          (msg) =>
            msg.role === "assistant" &&
            Array.isArray((msg as any).tool_calls) &&
            (msg as any).tool_calls.some(
              (tc: any) => tc.function?.name === navigationTrigger.toolName
            )
        );
        if (triggered) {
          action = { type: "navigate", to: navigationTrigger.navigateTo };
        }
      }

      return {
        reply: message.content || "",
        conversationHistory,
        ...(action && { action }),
      };
    }

    // Execute all tool calls in parallel
    const toolResults: ChatCompletionToolMessageParam[] = await Promise.all(
      message.tool_calls
        .filter((tc) => tc.type === "function")
        .map(async (toolCall) => {
          const handler = toolHandlers[toolCall.function.name];
          if (!handler) {
            return {
              role: "tool" as const,
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: `Unknown tool: ${toolCall.function.name}`,
              }),
            };
          }
          try {
            const args = JSON.parse(toolCall.function.arguments);
            console.log(
              `[${label}] → ${toolCall.function.name}(${JSON.stringify(args).slice(0, 200)})`
            );
            const result = await handler(args);
            console.log(`[${label}] ← ${toolCall.function.name} ok`);
            return {
              role: "tool" as const,
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            };
          } catch (error: any) {
            console.error(
              `[${label}] ← ${toolCall.function.name} ERROR: ${error.message}`
            );
            return {
              role: "tool" as const,
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: error.message }),
            };
          }
        })
    );

    conversationHistory.push(...toolResults);
  }
}
