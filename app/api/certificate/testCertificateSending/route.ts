import { prisma } from "@/lib/db";
import { sendCertificateEmail, CertificateField } from "@/lib/services/certificates";
import { compositeCertificate } from "@/lib/services/certificate-compositor";
import { body, expressError, handle, json } from "@/lib/api/express";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import { getCurrentUser, isAdmin } from "@/lib/auth/access";

/**
 * POST /api/certificate/testCertificateSending
 * Sends one test email with real event name and rendered certificate attachment.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return expressError(401, "Token is required");
    if (!isAdmin(user)) return expressError(403, "Unauthorized");

    await enforceRateLimit({ ...RATE_LIMITS.otpRequest, subject: user.id });

    const b = await body<Record<string, string>>(request);
    const to = (b.email ?? user.email).trim().toLowerCase();
    const recipientName = b.name ?? user.name ?? to;

    let eventName = b.eventName;
    let template = null;

    if (b.eventId) {
      const event = await prisma.event.findFirst({
        where: { OR: [{ id: b.eventId }, { formId: b.eventId }] },
        select: { id: true, name: true },
      });
      if (event) {
        eventName = eventName || event.name;
        template = await prisma.certificate.findFirst({
          where: { eventId: event.id },
          orderBy: { createdAt: "desc" },
        });
      } else {
        const form = await prisma.form.findUnique({
          where: { id: b.eventId },
          select: { info: true },
        });
        const info = (form?.info ?? {}) as Record<string, unknown>;
        if (typeof info.eventTitle === "string") {
          eventName = eventName || info.eventTitle;
        }
      }
    }

    // Composite certificate image if template found
    const certBuffer = template
      ? await compositeCertificate({
        templateUrl: template.template,
        fields: (template.fields as unknown as CertificateField[]) || [],
        fieldValues: { name: recipientName, email: to },
        qrUrl: "https://fedkiit.com",
      })
      : null;

    const result = await sendCertificateEmail({
      to,
      name: recipientName,
      eventName: eventName || "a FED KIIT event",
      certificateId: b.certificateId ?? "TEST-CERTIFICATE",
      subject: b.subject,
      body: b.body,
      attachmentBuffer: certBuffer,
      isTest: true,
    });

    if (!result.sent) {
      return expressError(502, result.reason || "Could not send the test email");
    }

    return json({ success: true, message: `Test certificate sent to ${to}` });
  });
}
