import "server-only";

import { getEnv } from "@/lib/env";
import { getUpcomingEvents, getPastEvents } from "@/lib/services/events";

export interface ChatbotFlowNode {
  id: string;
  label: string;
  query: string;
  icon?: string;
  priority: number;
  isActive: boolean;
}

export interface ChatbotFlowResponse {
  chatbotName: string;
  featuredPrompts: ChatbotFlowNode[];
  teaserMessage: string;
  activeEventsCount: number;
  latestEventName?: string;
}

/** Pre-configured static fallback flows */
const STATIC_EVENT_FLOWS: ChatbotFlowNode[] = [
  {
    id: "next-event",
    label: "Upcoming Events",
    query: "What are the upcoming events organized by FED KIIT?",
    priority: 100,
    isActive: true,
  },
  {
    id: "how-to-register",
    label: "Registration",
    query: "What live or upcoming events can I register for, and what details/fields are required in the registration form?",
    priority: 90,
    isActive: true,
  },
  {
    id: "get-certificate",
    label: "Certificates",
    query: "How do I download or view my certificates for FED events?",
    priority: 80,
    isActive: true,
  },
  {
    id: "fed-blogs",
    label: "Blogs",
    query: "Show me recent blog posts and articles written by FED KIIT!",
    priority: 70,
    isActive: true,
  },
  {
    id: "event-support",
    label: "Contact Team",
    query: "How can I contact the event coordinators for help or queries?",
    priority: 60,
    isActive: true,
  },
];

/** Custom dynamic overrides store for admin updates */
let dynamicFlowOverrides: Partial<ChatbotFlowNode>[] = [];

/**
 * Format raw date string into clean readable format (e.g., "26 Sep 2026")
 */
function formatCleanDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }
  } catch {
    // Fallback to raw string if unparseable
  }
  return dateStr;
}

/**
 * Generates dynamic event-centric chatbot flows populated with live database events.
 */
export async function getEventCentricFlows(): Promise<ChatbotFlowResponse> {
  const chatbotName = getEnv().CHATBOT_NAME;
  const [upcoming, past] = await Promise.all([
    getUpcomingEvents(),
    getPastEvents(),
  ]);

  const featuredPrompts: ChatbotFlowNode[] = [];

  // 1. Dynamic Top Spotlight Tile:
  // ONLY if an upcoming event is live, spotlight it: "[Event Title]"
  // If NO event is live, do not add an extra tile so "Upcoming Events" comes first!
  if (upcoming.length > 0) {
    const topEvent = upcoming[0];
    const cleanDate = formatCleanDate(topEvent.dateLabel);
    const dateClause = cleanDate ? ` scheduled for ${cleanDate}` : "";

    featuredPrompts.push({
      id: `event-${topEvent.id}`,
      label: `${topEvent.title}`,
      query: `Tell me all details about ${topEvent.title}${dateClause}`,
      priority: 110,
      isActive: true,
    });
  }

  // Include core fallback attention-seeking flows
  featuredPrompts.push(...STATIC_EVENT_FLOWS);

  // Apply any custom flow overrides
  if (dynamicFlowOverrides.length > 0) {
    for (const override of dynamicFlowOverrides) {
      if (override.id) {
        const index = featuredPrompts.findIndex((p) => p.id === override.id);
        if (index !== -1) {
          featuredPrompts[index] = { ...featuredPrompts[index], ...override };
        }
      }
    }
  }

  // Sort prompts by priority (descending)
  featuredPrompts.sort((a, b) => b.priority - a.priority);

  // Formulate dynamic attention-seeking teaser message using env CHATBOT_NAME
  let teaserMessage = `Explore FED & its Events! Ask ${chatbotName}`;
  if (upcoming.length > 0) {
    teaserMessage = `${upcoming[0].title} is live! Ask ${chatbotName} how to register`;
  }

  return {
    chatbotName,
    featuredPrompts,
    teaserMessage,
    activeEventsCount: upcoming.length,
    latestEventName: upcoming.length > 0 ? upcoming[0].title : past.length > 0 ? past[0].title : undefined,
  };
}

/**
 * Update or add custom flow options dynamically.
 */
export function updateFlowOverrides(overrides: Partial<ChatbotFlowNode>[]): { success: boolean } {
  dynamicFlowOverrides = overrides;
  return { success: true };
}
