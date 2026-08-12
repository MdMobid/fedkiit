import { body, handle, json } from "@/lib/api/express";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import { getEventCentricFlows, updateFlowOverrides, type ChatbotFlowNode } from "@/lib/services/chatbot-flow";

/**
 * GET /api/chatbot/flow
 * Returns dynamic event-centric chatbot flows, category tabs, and attention-seeking teaser prompts.
 */
export async function GET() {
  return handle(async () => {
    await enforceRateLimit(RATE_LIMITS.chatbot);
    const flowData = await getEventCentricFlows();
    return json({ success: true, ...flowData });
  });
}

/**
 * POST /api/chatbot/flow
 * Endpoint to structure, arrange, or update dynamic chatbot questions and prompt priorities.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await enforceRateLimit(RATE_LIMITS.chatbot);
    const { overrides } = await body<{ overrides?: Partial<ChatbotFlowNode>[] }>(request);
    if (!Array.isArray(overrides)) {
      return json({ success: false, message: "Invalid overrides format" }, 400);
    }
    const result = updateFlowOverrides(overrides);
    return json(result);
  });
}

export async function PUT(request: Request) {
  return POST(request);
}
