import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { unstable_cache } from "next/cache";

import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { FAQS, SITE, SOCIALS } from "@/lib/site";
import { getUpcomingEvents, getPastEvents, getAllPublicEvents, getEventWithSections } from "@/lib/services/events";
import { getLatestPosts } from "@/lib/services/blogs";
import { getTeam, getAlumni, humanizeAccess } from "@/lib/services/people";

/**
 * The FED chatbot — Progressive Context Resolution architecture.
 *
 * Instead of loading all data on every request, context is loaded in 3 tiers:
 *   Tier 1 (always): Static site info, FAQs, social links, page routes.
 *   Tier 2 (intent-detected): Team/Events/Blogs loaded based on keyword scan.
 *   Tier 3 (model-signalled): Alumni/PastEvents loaded on signal word re-query.
 *
 * This reduces average token usage by ~60% and enables alumni lookups without
 * bloating every request.
 */

export type ChatMessage = { role: "user" | "model"; text: string };

const MAX_HISTORY = 10;

/** Key rotation state, scoped per process and advanced only on rate limits. */
let keyCursor = 0;

// ---------------------------------------------------------------------------
// Tier 2: Intent Detection
// ---------------------------------------------------------------------------

/** Intent flags indicating which data chunks to load. */
interface DetectedIntents {
  needsTeam: boolean;
  needsEvents: boolean;
  needsBlogs: boolean;
}

/** Keyword patterns for Tier 2 intent detection. */
const INTENT_PATTERNS: { key: keyof DetectedIntents; pattern: RegExp }[] = [
  {
    key: "needsEvents",
    pattern:
      /\b(event|events|register|registration|hackathon|workshop|ideathon|bootcamp|competition|fest|seminar|webinar|conference|meet|meetup)\b/i,
  },
  {
    key: "needsTeam",
    pattern:
      /\b(team|member|members|president|vice\s*president|director|deputy|senior\s*executive|who\s+is|who\s+are|people|roster|lead|coordinator)\b/i,
  },
  {
    key: "needsBlogs",
    pattern: /\b(blog|blogs|article|articles|post|posts|read|medium|write|written)\b/i,
  },
];

/**
 * Lightweight in-memory cache of known event titles for Tier 2 name matching.
 * Rebuilt every 5 minutes. This lets us detect "OMEGA" or "Ideathon 3.0" as
 * event-related without the generic keyword list catching it.
 */
const getEventTitleCache = unstable_cache(
  async (): Promise<string[]> => {
    try {
      const events = await getAllPublicEvents();
      return events.map((e) => e.title.toLowerCase());
    } catch {
      return [];
    }
  },
  ["chatbot-event-titles"],
  { revalidate: 300 },
);

/**
 * Lightweight in-memory cache of known team member names for Tier 2.
 * Detects "Niket" or "Raj" as team-related queries.
 */
const getTeamNameCache = unstable_cache(
  async (): Promise<string[]> => {
    try {
      const team = await getTeam();
      const names: string[] = [];
      for (const m of team) {
        names.push(m.name.toLowerCase());
        const firstName = m.name.split(" ")[0];
        if (firstName && firstName.length > 2) {
          names.push(firstName.toLowerCase());
        }
      }
      return names;
    } catch {
      return [];
    }
  },
  ["chatbot-team-names"],
  { revalidate: 300 },
);

/**
 * Detects which data chunks the user's message likely needs.
 *
 * 1. Checks keyword patterns (fast regex).
 * 2. Checks if the message contains a known event title or team member name.
 */
async function detectIntents(message: string): Promise<DetectedIntents> {
  const intents: DetectedIntents = {
    needsTeam: false,
    needsEvents: false,
    needsBlogs: false,
  };

  // Step 1: Keyword pattern matching
  for (const { key, pattern } of INTENT_PATTERNS) {
    if (pattern.test(message)) {
      intents[key] = true;
    }
  }

  // Step 2: Check for known event titles and team names (fuzzy substring)
  const msgLower = message.toLowerCase();

  if (!intents.needsEvents) {
    const eventTitles = await getEventTitleCache();
    for (const title of eventTitles) {
      if (title.length >= 3 && msgLower.includes(title)) {
        intents.needsEvents = true;
        break;
      }
    }
  }

  if (!intents.needsTeam) {
    const teamNames = await getTeamNameCache();
    for (const name of teamNames) {
      if (name.length >= 3 && msgLower.includes(name)) {
        intents.needsTeam = true;
        break;
      }
    }
  }

  return intents;
}

// ---------------------------------------------------------------------------
// Tier 3: Signal Word Protocol
// ---------------------------------------------------------------------------

/** Signal words the model emits when it needs more context. */
const SIGNAL_WORDS = {
  NEED_ALUMNI: "[NEED_ALUMNI]",
  NEED_PAST_EVENTS: "[NEED_PAST_EVENTS]",
} as const;

/**
 * Checks model response for signal words. Returns the signal found, or null.
 */
function detectSignalWord(
  reply: string,
): keyof typeof SIGNAL_WORDS | null {
  for (const [key, tag] of Object.entries(SIGNAL_WORDS)) {
    if (reply.includes(tag)) {
      return key as keyof typeof SIGNAL_WORDS;
    }
  }
  return null;
}

/**
 * Fetches supplementary context for a signal word.
 */
async function fetchSignalContext(signal: keyof typeof SIGNAL_WORDS): Promise<string> {
  switch (signal) {
    case "NEED_ALUMNI": {
      const alumni = await getAlumni();
      if (alumni.length === 0) return "ALUMNI DATA\n- No alumni records found.";
      const lines = alumni
        .slice(0, 40)
        .map(
          (m) =>
            `- ${m.name} — ${m.title || humanizeAccess(m.access)}${m.year ? ` (year ${m.year})` : ""}`,
        )
        .join("\n");
      return `ALUMNI DATA (${alumni.length} members)\n${lines}`;
    }
    case "NEED_PAST_EVENTS": {
      const pastEvents = await getPastEvents();
      if (pastEvents.length === 0) return "PAST EVENTS\n- No past events found.";
      const lines = pastEvents
        .slice(0, 12)
        .map(
          (e) =>
            `- ${e.title}${e.dateLabel ? ` on ${e.dateLabel}` : ""} — ${e.type || "event"}. Details: /Events/${e.id}`,
        )
        .join("\n");
      return `PAST EVENTS (${pastEvents.length} total)\n${lines}`;
    }
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Context Assembly
// ---------------------------------------------------------------------------

function buildSystemPrompt(context: string): string {
  const name = getEnv().CHATBOT_NAME;

  return `You are ${name}, the event-focused assistant for the ${SITE.name} website.
FED stands for Federation of Entrepreneurship Development, the student entrepreneurship body of KIIT TBI at KIIT University, Bhubaneswar.

YOUR PRIMARY SCOPE & FOCUS
- Primary Focus: Help users with FED Events, Event Registrations, Hackathons, Bootcamps, Workshops, and Event Certificates.
- Automatic Page Navigation: Whenever you recommend or discuss a specific page or event, always append the navigation tag at the end of your response:
  - For upcoming events list: append [NAV:/Events]
  - For past events/highlights: append [NAV:/Events/pastEvents]
  - For team roster: append [NAV:/Team]
  - For blogs: append [NAV:/Blog]
  - For alumni: append [NAV:/Alumni]
  - For certificates: append [NAV:/profile/certificates]
  - For contact section: append [NAV:/#Contact]
  - For a specific event details/registration page: append [NAV:/Events/EVENT_ID]
- Handling Upcoming Event Enquiries:
  - If live upcoming events exist in context below, describe them and guide user to register [NAV:/Events].
  - If NO live upcoming events exist (context states "No upcoming events are published right now"), state clearly and warmly: "There are currently no live upcoming events scheduled at the moment. However, check out highlights from our recent past events!" then summarize recent past events and append [NAV:/Events/pastEvents].
- Handling Registration & Form Field Enquiries:
  - When users ask about Registration or registration forms, list the live/upcoming events, specify entry fees & participation rules, enumerate the required registration form fields from context (e.g. Name, Phone, Team Name, Roll No, etc.), and append [NAV:/Events/EVENT_ID/Form] (where EVENT_ID is the exact id of the top live event from context below, e.g. [NAV:/Events/6a6d0ce23c63fe0ec33d333b/Form]). If no event id is available, fallback to [NAV:/Events].
- Handling Certificate Enquiries:
  - When users ask about downloading, viewing, or verifying event certificates, explain clearly that verified event participation certificates can be viewed and downloaded under their profile at [Profile Certificates](/profile/certificates) or verified at [Certificate Verification](/verify/certificate). Always append [NAV:/profile/certificates].
- When users ask general or off-topic questions, answer briefly and enthusiastically guide them to explore FED events or blogs.
- Never invent facts about people, dates or events — if the context below does not contain the answer, say you do not have that information and point the user at the relevant page.

SIGNAL PROTOCOL (CRITICAL — follow these rules exactly)
When you cannot find the requested information in the LIVE CONTEXT below, respond with ONLY the appropriate signal word and nothing else:
- If a user asks about a person whose name is NOT listed in the TEAM section below, respond with exactly: ${SIGNAL_WORDS.NEED_ALUMNI}
- If a user asks about past events and no past events are listed in context, respond with exactly: ${SIGNAL_WORDS.NEED_PAST_EVENTS}
Do NOT guess or make up information. Use signal words so the system can fetch more data for you.

FORMATTING RULES
Use Markdown only. Never emit HTML tags. Links must use [label](url) syntax — never a bare URL and never an <a> tag.
Keep answers short: two or three sentences for simple questions. Use a bulleted list when enumerating events or people.
Translate role codes into readable titles, for example DIRECTOR_TECHNICAL becomes "Director of Technical".

ATTRIBUTION
FED was founded by Niket Raj Dwivedi, CEO of Medial. Mention this only when the user asks specifically about the founder.

LIVE CONTEXT
${context}`;
}

/**
 * Assembles context selectively based on detected intents.
 *
 * Tier 1 (always): Site info, FAQs, social links, page routes.
 * Tier 2 (selective): Team, events, blogs — only when intent-detected.
 */
async function buildContext(intents: DetectedIntents): Promise<string> {
  const promises: Promise<void>[] = [];
  let teamLines = "";
  let eventLines = "";
  let postLines = "";

  if (intents.needsTeam) {
    promises.push(
      getTeam().then((team) => {
        teamLines = team.length
          ? team
            .slice(0, 60)
            .map((m) => {
              const links = [
                m.linkedin ? `LinkedIn: ${m.linkedin}` : null,
                m.github ? `GitHub: ${m.github}` : null,
              ]
                .filter(Boolean)
                .join(", ");
              return `- ${m.name} — ${m.title || humanizeAccess(m.access)}${m.year ? ` (year ${m.year})` : ""
                }${links ? ` [${links}]` : ""}`;
            })
            .join("\n")
          : "- Roster is not published yet.";
      }),
    );
  }

  if (intents.needsEvents) {
    promises.push(
      getUpcomingEvents().then(async (events) => {
        if (!events.length) {
          eventLines = "- No upcoming events are published right now.";
          return;
        }

        const eventDetails = await Promise.all(
          events.slice(0, 8).map(async (e) => {
            const withSections = await getEventWithSections(e.id);
            const fieldLabels = withSections?.sections
              .flatMap((s) => s.fields || [])
              .map((f) => f.label || f.name)
              .filter(Boolean)
              .join(", ");

            return `- ${e.title}${e.dateLabel ? ` on ${e.dateLabel}` : ""} — ${e.isPaid ? `paid, Rs ${e.amount}` : "free"
              }, ${e.participationType.toLowerCase()} entry (${e.participationType === "Team"
                ? `team size ${e.minTeamSize}-${e.maxTeamSize}`
                : "individual"
              }), ${e.isRegistrationOpen ? "registration open" : "registration closed"
              }.${fieldLabels ? ` Required registration form fields: ${fieldLabels}.` : ""
              } Event ID: ${e.id}. Direct Registration Form URL: /Events/${e.id}/Form`;
          }),
        );

        eventLines = eventDetails.join("\n");
      }),
    );
  }

  if (intents.needsBlogs) {
    promises.push(
      getLatestPosts(4).then((posts) => {
        postLines = posts.length
          ? posts.map((p) => `- ${p.title} (${p.dateLabel}) — ${p.link}`).join("\n")
          : "- No published blog posts.";
      }),
    );
  }

  await Promise.all(promises);

  // Tier 1: Always-present static context
  const faqLines = FAQS.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n");
  const socialLines = SOCIALS.map((s) => `- ${s.label}: ${s.href}`).join("\n");

  const sections: string[] = [];

  sections.push(`ABOUT FED\n${SITE.about}`);

  if (intents.needsTeam) {
    sections.push(`TEAM\n${teamLines}`);
  }

  if (intents.needsEvents) {
    sections.push(`UPCOMING EVENTS\n${eventLines}`);
  }

  if (intents.needsBlogs) {
    sections.push(`RECENT BLOG POSTS\n${postLines}`);
  }

  sections.push(`SOCIAL LINKS\n${socialLines}`);
  sections.push(`COMMON QUESTIONS\n${faqLines}`);
  sections.push(
    `SITE PAGES\n- Events: /Events\n- Past events: /Events/pastEvents\n- Team: /Team\n- Alumni: /Alumni\n- Blog: /Blog\n- Certificates: /profile/certificates\n- Verify Certificate: /verify/certificate\n- Contact form: /#Contact`,
  );

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Gemini Integration
// ---------------------------------------------------------------------------

function isRateLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|quota|resource_exhausted/i.test(message);
}

/**
 * Calls Gemini with the given prompt, rotating keys on rate limits.
 */
async function callGemini(
  systemInstruction: string,
  history: Array<{ role: string; parts: Array<{ text: string }> }>,
  message: string,
): Promise<string> {
  const env = getEnv();
  const keys = env.GEMINI_API_KEYS;

  if (keys.length === 0) {
    throw new ApiError(503, "The assistant is not configured right now.");
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const index = (keyCursor + attempt) % keys.length;
    const key = keys[index]!;

    try {
      const client = new GoogleGenerativeAI(key);
      const model = client.getGenerativeModel({
        model: env.GEMINI_MODEL,
        systemInstruction,
      });

      const chat = model.startChat({
        history,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 800,
        },
      });

      const result = await chat.sendMessage(message);
      const reply = result.response.text().trim();

      if (!reply) throw new Error("Empty response from model");

      keyCursor = index;
      return reply;
    } catch (error) {
      lastError = error;
      if (isRateLimit(error)) {
        keyCursor = (index + 1) % keys.length;
        continue;
      }
      break;
    }
  }

  console.error("[chatbot] all attempts failed", lastError);
  throw new ApiError(
    503,
    "The assistant is unavailable at the moment. Please try again shortly.",
  );
}

/**
 * Sends a turn to Gemini with Progressive Context Resolution.
 */
export async function generateChatReply(input: {
  message: string;
  history?: ChatMessage[];
}): Promise<{ reply: string }> {
  // Tier 2: Detect intents from user message
  const intents = await detectIntents(input.message);

  // Build selective context (Tier 1 always + Tier 2 selective)
  const context = await buildContext(intents);
  const systemInstruction = buildSystemPrompt(context);

  let history = (input.history ?? [])
    .slice(-MAX_HISTORY)
    .map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text.slice(0, 4000) }],
    }));

  // Ensure history starts with a 'user' turn (Google Generative AI SDK requirement)
  const firstUserIndex = history.findIndex((h) => h.role === "user");
  if (firstUserIndex === -1) {
    history = [];
  } else if (firstUserIndex > 0) {
    history = history.slice(firstUserIndex);
  }

  // First pass: query with selective context
  let reply = await callGemini(systemInstruction, history, input.message);

  // Tier 3: Check for signal words — if found, fetch more data and re-query
  const signal = detectSignalWord(reply);
  if (signal) {
    const extraContext = await fetchSignalContext(signal);
    if (extraContext) {
      const enrichedContext = `${context}\n\n${extraContext}`;
      const enrichedPrompt = buildSystemPrompt(enrichedContext);

      reply = await callGemini(enrichedPrompt, history, input.message);

      for (const tag of Object.values(SIGNAL_WORDS)) {
        reply = reply.replace(tag, "").trim();
      }
    }
  }

  return { reply };
}
