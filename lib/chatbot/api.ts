/**
 * Chatbot API Client
 * Sends messages to the Next.js App Router route handler at /api/chatbot/message,
 * which uses rotating Gemini keys via lib/services/chatbot.
 */

export interface ConversationTurn {
  role: "user" | "model";
  text: string;
}

export async function sendMessageToBot(
  message: string,
  conversationHistory: ConversationTurn[] = []
): Promise<string> {
  try {
    const res = await fetch("/api/chatbot/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversationHistory }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    const data = await res.json() as { success: boolean; response: string };
    if (!data.success) throw new Error("Server returned success: false");
    return data.response;
  } catch (error) {
    console.error("[ChatWidget] sendMessageToBot error:", error);
    return "Sorry, I had trouble connecting to my servers. Please try again in a moment.";
  }
}
