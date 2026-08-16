import { prisma } from "@/lib/db";
import { body, expressError, handle, json } from "@/lib/api/express";
import { getCurrentUser, isAdmin } from "@/lib/auth/access";

/**
 * POST /api/certificate/sendCertificatesAndEvents
 * Port of controllers/certificate/eventCertificateController.js.
 *
 * The name is misleading and comes from the Express backend: this sends
 * nothing. It looks up the certificates already issued to one email address and
 * returns each one alongside the event it belongs to, which is what the "My
 * Events" tab uses to put a View link on each past event.
 *
 * It was previously implemented here as the certificate *issuing* endpoint —
 * admin-only, taking `{ eventId, recipients }` and returning `{ data }`. Nothing
 * called it that way; the only caller is the participant profile, which sends
 * `{ email }` and reads `certandevent`. So every participant got a 403, their
 * certificate list stayed empty, and the View button had no link to follow.
 *
 * Access: you may read your own certificates; admins may read anyone's. The
 * Express route had no auth middleware at all, which let anyone enumerate
 * another member's certificates by guessing their address.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return expressError(401, "Token is required");

    const b = await body<{ email?: string }>(request);
    const email = (b.email ?? "").toLowerCase().trim();
    if (!email) return expressError(400, "Email is required");

    if (email !== user.email.toLowerCase() && !isAdmin(user)) {
      return expressError(403, "Unauthorized");
    }

    const issued = await prisma.issuedCertificates.findMany({
      where: { email },
      include: { event: true },
    });

    // Shape kept identical to Express: [{ cert, event }], with rows whose event
    // has since been deleted dropped rather than returned as null.
    const certandevent = issued
      .filter((row) => row.event)
      .map(({ event, ...cert }) => ({ cert, event }));

    return json({ certandevent });
  });
}
