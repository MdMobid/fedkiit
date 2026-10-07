import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { sendMail } from "@/lib/email/mailer";
import { siteUrl } from "@/lib/env";
import {
  compositeCertificate,
  loadTemplateBuffer,
} from "./certificate-compositor";

/**
 * Certificates.
 *
 * Ports controllers/certificate/*. The data model is unchanged:
 *   Certificate         — one template per event: an image plus field positions
 *   issuedCertificates  — one row per recipient, with their field values
 *
 * Rendering note: the Express version composited the finished image server-side
 * with `canvas` and `puppeteer`. Neither is used here — both are heavyweight
 * native dependencies that do not deploy cleanly to a serverless runtime, and
 * `puppeteer` alone pulls a full Chromium download.
 *
 * Instead the template URL and the field coordinates are returned, and the
 * client composites onto a canvas — which is exactly what CertificatesForm.jsx
 * and CertificatePreview.jsx already do for the live preview, using html2canvas.
 * The stored `imageSrc` is still honoured when a row already has one.
 */

export type CertificateField = {
  x: number;
  y: number;
  fieldName: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
};

/** Public certificate lookup, used by /verify/certificate. */
export async function verifyCertificate(certificateId: string) {
  const id = certificateId?.trim();
  if (!id) throw new ApiError(400, "Certificate ID is required");

  // Query strictly by issued certificate ID to prevent template ID collisions
  const issued = await prisma.issuedCertificates.findFirst({
    where: { id },
  });

  if (!issued) throw new ApiError(404, "Certificate not found");

  const rawValues = (issued.fieldValues as Record<string, any>) || {};
  if (rawValues._isDeleted) {
    throw new ApiError(404, "Certificate not found");
  }

  const event = await prisma.event.findUnique({
    where: { id: issued.eventId },
    select: { id: true, name: true, description: true, createdAt: true },
  });

  const template =
    (issued.certificateId
      ? await prisma.certificate.findUnique({
        where: { id: issued.certificateId },
        select: { template: true, fields: true },
      })
      : null) ??
    (await prisma.certificate.findFirst({
      where: { eventId: issued.eventId },
      orderBy: { createdAt: "desc" },
      select: { template: true, fields: true },
    }));

  const templateUrl =
    (issued.fieldValues as any)?._templateUrl ||
    template?.template;

  const configuredFields = (
    (issued.fields && Array.isArray(issued.fields) && issued.fields.length > 0)
      ? issued.fields
      : template?.fields || []
  ) as unknown as CertificateField[];

  let compositedImageSrc = issued.imageSrc;
  if (!compositedImageSrc && templateUrl) {
    try {
      const rawValues = (issued.fieldValues as Record<string, string>) || {};
      const certBuffer = await compositeCertificate({
        templateUrl,
        fields: configuredFields,
        fieldValues: {
          ...rawValues,
          name: rawValues.name || rawValues.Name || issued.email,
        },
        certificateId: issued.id,
      });
      if (certBuffer) {
        compositedImageSrc = `data:image/png;base64,${certBuffer.toString("base64")}`;
      }
    } catch (e) {
      console.error("[verifyCertificate] failed to composite image:", e);
    }
  }

  return {
    // The frontend reads `imageSrc` at the top level
    imageSrc: compositedImageSrc ?? templateUrl ?? null,
    certificate: {
      certificateId: issued.certificateId ?? issued.id,
      email: issued.email,
      fieldValues: issued.fieldValues,
      fields: configuredFields,
      mailed: issued.mailed,
    },
    template: template
      ? { image: templateUrl, fields: configuredFields }
      : null,
    event,
  };
}

/** Creates or replaces an event's certificate template. */
export async function addCertificateTemplate(input: {
  eventId: string;
  template: string;
  fields: CertificateField[];
}) {
  if (!input.eventId) throw new ApiError(400, "Event ID is required");
  if (!input.template) throw new ApiError(400, "A template image is required");

  const resolvedEventId = await getOrCreateCertificateEventId(input.eventId);

  const existing = await prisma.certificate.findFirst({
    where: { eventId: resolvedEventId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  // Check if any certificates have already been issued using this existing template
  const issuedCount = existing
    ? await prisma.issuedCertificates.count({
      where: { certificateId: existing.id },
    })
    : 0;

  const fields = input.fields as unknown as Prisma.InputJsonValue[];

  // If certificates have already been issued with the existing template, preserve it!
  // Create a brand new Certificate template so previously issued certificates (round 1,
  // participation, OC, etc.) are never affected.
  const record =
    existing && issuedCount === 0
      ? await prisma.certificate.update({
        where: { id: existing.id },
        data: { template: input.template, fields },
      })
      : await prisma.certificate.create({
        data: { eventId: resolvedEventId, template: input.template, fields },
      });

  return record;
}

/** Template plus a sample row, for the admin preview. */
export async function resolveEventId(rawEventId?: string): Promise<string | null> {
  const value = rawEventId?.trim();
  if (!value) return null;

  const byId = await prisma.event.findUnique({
    where: { id: value },
    select: { id: true },
  });
  if (byId) return byId.id;

  const byFormId = await prisma.event.findFirst({
    where: { formId: value },
    select: { id: true },
  });
  if (byFormId) return byFormId.id;

  return null;
}

/**
 * Fetches all issued certificates for an event with recipient names, email,
 * and delivery status (admin only).
 */
export async function getEventIssuedCertificates(rawEventId: string) {
  const resolvedEventId = await resolveEventId(rawEventId);
  if (!resolvedEventId) {
    return {
      event: null,
      template: null,
      certificates: [],
      total: 0,
      totalMailed: 0,
    };
  }

  const [event, template, issued] = await Promise.all([
    prisma.event.findUnique({
      where: { id: resolvedEventId },
      select: { id: true, name: true, description: true, createdAt: true, formId: true },
    }),
    prisma.certificate.findFirst({
      where: { eventId: resolvedEventId },
      orderBy: { createdAt: "desc" },
      select: { id: true, fields: true }, // Omit large template image string for fast response
    }),
    prisma.issuedCertificates.findMany({
      where: { eventId: resolvedEventId },
      select: {
        id: true,
        email: true,
        fieldValues: true,
        mailed: true,
        certificateId: true,
      },
      orderBy: { id: "desc" },
    }),
  ]);

  const mapped = issued.map((c) => {
    const rawValues = (c.fieldValues as any) || {};
    return {
      id: c.id,
      email: c.email,
      name:
        rawValues?.name ||
        rawValues?.Name ||
        rawValues?.recipient_name ||
        c.email,
      mailed: Boolean(c.mailed),
      isDeleted: Boolean(rawValues?._isDeleted),
      deletedAt: rawValues?._deletedAt || null,
      // Omit heavy raw fieldValues (containing base64 snapshots) for lightning fast payload
    };
  });

  const active = mapped.filter((c) => !c.isDeleted);
  const trashed = mapped.filter((c) => c.isDeleted);
  const totalMailed = active.filter((c) => c.mailed).length;

  return {
    event,
    template: template
      ? { id: template.id, fields: template.fields }
      : null,
    certificates: mapped,
    total: active.length,
    totalMailed,
    totalTrash: trashed.length,
  };
}

/**
 * Moves an issued certificate to trash (soft-delete). Admin only.
 */
export async function trashIssuedCertificate(id: string) {
  const cleanId = id?.trim();
  if (!cleanId) throw new ApiError(400, "Certificate ID is required");

  const existing = await prisma.issuedCertificates.findUnique({
    where: { id: cleanId },
    select: { id: true, fieldValues: true },
  });

  if (!existing) {
    throw new ApiError(404, "Certificate not found");
  }

  const rawValues = (existing.fieldValues as Record<string, any>) || {};
  return prisma.issuedCertificates.update({
    where: { id: existing.id },
    data: {
      fieldValues: {
        ...rawValues,
        _isDeleted: true,
        _deletedAt: new Date().toISOString(),
      },
    },
    select: { id: true },
  });
}

/**
 * Restores a trashed certificate back to active. Admin only.
 */
export async function restoreIssuedCertificate(id: string) {
  const cleanId = id?.trim();
  if (!cleanId) throw new ApiError(400, "Certificate ID is required");

  const existing = await prisma.issuedCertificates.findUnique({
    where: { id: cleanId },
    select: { id: true, fieldValues: true },
  });

  if (!existing) {
    throw new ApiError(404, "Certificate not found");
  }

  const rawValues = (existing.fieldValues as Record<string, any>) || {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _isDeleted, _deletedAt, ...cleanValues } = rawValues;

  return prisma.issuedCertificates.update({
    where: { id: existing.id },
    data: {
      fieldValues: cleanValues,
    },
    select: { id: true },
  });
}

/**
 * Permanently deletes an issued certificate by ID. Admin only.
 */
export async function deleteIssuedCertificate(id: string) {
  const cleanId = id?.trim();
  if (!cleanId) throw new ApiError(400, "Certificate ID is required");

  return prisma.issuedCertificates.delete({
    where: { id: cleanId },
    select: { id: true },
  });
}

/**
 * Restores multiple certificates from trash by IDs concurrently. Admin only.
 */
export async function restoreMultipleIssuedCertificates(ids: string[]) {
  if (!ids || ids.length === 0) return { restoredCount: 0 };
  const records = await prisma.issuedCertificates.findMany({
    where: { id: { in: ids } },
    select: { id: true, fieldValues: true },
  });

  await Promise.all(
    records.map((record) => {
      const rawValues = (record.fieldValues as Record<string, any>) || {};
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _isDeleted, _deletedAt, ...cleanValues } = rawValues;
      return prisma.issuedCertificates.update({
        where: { id: record.id },
        data: { fieldValues: cleanValues },
        select: { id: true },
      });
    })
  );

  return { restoredCount: records.length };
}

/**
 * Restores all trashed certificates for an event. Admin only.
 */
export async function restoreAllTrashedCertificates(rawEventId: string) {
  const eventId = (await resolveEventId(rawEventId)) || rawEventId;
  const issued = await prisma.issuedCertificates.findMany({
    where: { eventId },
    select: { id: true, fieldValues: true },
  });
  const trashedIds = issued
    .filter((c) => Boolean((c.fieldValues as Record<string, any>)?._isDeleted))
    .map((c) => c.id);

  return restoreMultipleIssuedCertificates(trashedIds);
}

/**
 * Permanently deletes multiple issued certificates by ID. Admin only.
 */
export async function deleteMultipleIssuedCertificates(ids: string[]) {
  if (!ids || ids.length === 0) return { deletedCount: 0 };
  const result = await prisma.issuedCertificates.deleteMany({
    where: { id: { in: ids } },
  });
  return { deletedCount: result.count };
}

/**
 * Permanently deletes all trashed certificates for an event. Admin only.
 */
export async function deleteAllTrashedCertificates(rawEventId: string) {
  const eventId = (await resolveEventId(rawEventId)) || rawEventId;
  const issued = await prisma.issuedCertificates.findMany({
    where: { eventId },
    select: { id: true, fieldValues: true },
  });
  const trashedIds = issued
    .filter((c) => Boolean((c.fieldValues as Record<string, any>)?._isDeleted))
    .map((c) => c.id);

  return deleteMultipleIssuedCertificates(trashedIds);
}

/**
 * Certificate management is opened from a form id. Older deployments created
 * the companion Event in a separate Express endpoint; create it here when it
 * does not exist yet so a newly uploaded template has somewhere to live.
 */
async function getOrCreateCertificateEventId(rawEventId?: string): Promise<string> {
  const existingId = await resolveEventId(rawEventId);
  if (existingId) return existingId;

  const formId = rawEventId?.trim();
  if (!formId) throw new ApiError(400, "Event ID is required");

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, info: true },
  });
  if (!form) throw new ApiError(404, "Event form not found");

  const configuredOrganisationId =
    process.env.CERTIFICATE_ORGANISATION_ID ?? process.env.NEXT_PUBLIC_CERT_ORG;
  const hasValidConfiguredOrganisationId = /^[a-f\d]{24}$/i.test(
    configuredOrganisationId ?? "",
  );
  const configuredOrganisation = hasValidConfiguredOrganisationId
    ? await prisma.organisation.findUnique({
      where: { id: configuredOrganisationId! },
      select: { id: true },
    })
    : null;
  const organisation =
    configuredOrganisation ??
    (await prisma.organisation.findFirst({ select: { id: true } }));

  if (!organisation) {
    throw new ApiError(400, "No organisation is available for certificate events");
  }

  const info = (form.info ?? {}) as Record<string, unknown>;
  const name = typeof info.eventTitle === "string" ? info.eventTitle : "Untitled Event";
  const description =
    typeof info.eventdescription === "string"
      ? info.eventdescription
      : typeof info.eventDescription === "string"
        ? info.eventDescription
        : "";

  const event = await prisma.event.create({
    data: { name, description, organisationId: organisation.id, formId: form.id },
    select: { id: true },
  });
  return event.id;
}

export async function dummyCertificate(input: {
  eventId: string;
  fieldValues?: Record<string, string>;
}) {
  const resolvedEventId = await resolveEventId(input.eventId);
  if (!resolvedEventId) {
    return {
      template: null,
      fields: [],
      fieldValues: input.fieldValues ?? { name: "Sample Name" },
    };
  }

  const template = await prisma.certificate.findFirst({
    where: { eventId: resolvedEventId },
    orderBy: { createdAt: "desc" },
  });
  if (!template) {
    return {
      template: null,
      fields: [],
      fieldValues: input.fieldValues ?? { name: "Sample Name" },
    };
  }

  return {
    template: template.template,
    fields: template.fields,
    fieldValues: input.fieldValues ?? { name: "Sample Name" },
  };
}

/** Emails one certificate. Used for the admin's test send and batch issuance. */
export async function sendCertificateEmail(input: {
  to: string;
  name: string;
  eventName: string;
  certificateId: string;
  isTest?: boolean;
  subject?: string;
  body?: string;
  attachmentBuffer?: Buffer | null;
}) {
  const verifyUrl = `${siteUrl()}/verify/certificate?id=${encodeURIComponent(input.certificateId)}`;

  const escape = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Interpolate tokens in custom subject or use standard default
  const mailSubject = (input.subject?.trim() || `Your certificate for ${input.eventName}`)
    .replace(/\{(?:recipient_)?name\}/gi, input.name);

  // Custom body processing: replace tokens
  let customBodyHtml = "";
  if (input.body && input.body.trim()) {
    const interpolated = input.body.replace(/\{(?:recipient_)?name\}/gi, escape(input.name));
    // If admin wrote HTML tags, keep HTML structure; if plain text, convert newlines to <br/>
    const hasHtml = /<[a-z][\s\S]*>/i.test(interpolated);
    const content = hasHtml
      ? interpolated
      : interpolated.replace(/\r\n|\n|\r/g, "<br/>");

    customBodyHtml = `<div style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #3f3f46;">${content}</div>`;
  }

  const attachments = input.attachmentBuffer
    ? [
      {
        filename: `Certificate-${input.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "FED"}.png`,
        content: input.attachmentBuffer,
      },
    ]
    : undefined;

  return sendMail({
    to: input.to,
    subject: mailSubject,
    attachments,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:'Open Sans',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#1c1c1c;background-image:linear-gradient(260deg,#ffbe0b -29.7%,#f42b03 128.34%);padding:24px 32px;">
<p style="margin:0;font-size:20px;font-weight:700;color:#fff;">FED KIIT</p></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 14px;font-size:19px;color:#1c1c1c;">Your certificate is ready</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3f3f46;">
Hi ${escape(input.name)}, thank you for taking part in
<strong>${escape(input.eventName)}</strong>. Your certificate is available below and attached.</p>
${customBodyHtml}
${input.isTest ? `<p style="margin:0;font-size:13px;color:#6b7280;">This is a test email. A certificate is not issued until you use Send Mail.</p>` : `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
<td style="border-radius:8px;background:#ff8a00;">
<a href="${verifyUrl}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#1c1c1c;text-decoration:none;">View certificate</a>
</td></tr></table>
<p style="margin:0;font-size:13px;color:#6b7280;">Certificate ID: ${escape(input.certificateId)}</p>`}
</td></tr></table></td></tr></table></body></html>`,
  });
}

/**
 * Issues certificates to a list of recipients and emails them.
 *
 * Idempotent: a recipient who has already been mailed is skipped unless
 * `resend` is set.
 */
export async function sendCertificateBatch(input: {
  eventId: string;
  recipients: Array<{ email: string; fieldValues?: Record<string, string> }>;
  subject?: string;
  body?: string;
  frequency?: number;
  resend?: boolean;
}) {
  if (!input.eventId) throw new ApiError(400, "Event ID is required");
  if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
    throw new ApiError(400, "At least one recipient is required");
  }

  const resolvedEventId = await getOrCreateCertificateEventId(input.eventId);

  const event = await prisma.event.findUnique({
    where: { id: resolvedEventId },
    select: { id: true, name: true },
  });
  if (!event) throw new ApiError(404, "Event not found");

  const template = await prisma.certificate.findFirst({
    where: { eventId: resolvedEventId },
    orderBy: { createdAt: "desc" },
  });
  if (!template) {
    throw new ApiError(404, "No certificate template exists for this event");
  }

  // Scope existing check by certificateId so an attendee can receive multiple different
  // certificates for the same event (e.g. participation, round 1, winner, OC, etc.)
  const existing = await prisma.issuedCertificates.findMany({
    where: {
      eventId: resolvedEventId,
      certificateId: template.id,
    },
    select: { id: true, email: true, mailed: true },
  });
  const existingByEmail = new Map(
    existing.map((certificate) => [certificate.email.toLowerCase(), certificate]),
  );

  let issued = 0;
  let skipped = 0;
  let mailed = 0;
  const failures: Array<{ email: string; error: string }> = [];

  // Pacing delay (e.g. 150ms between emails to respect Resend rate limits safely)
  const delayMs = input.frequency && input.frequency > 0 ? Math.max(50, Math.min(1000, Math.round(60000 / input.frequency))) : 150;

  // Pre-load template image buffer once to eliminate redundant HTTP downloads for each recipient
  const templateBuffer = await loadTemplateBuffer(template.template);

  for (let i = 0; i < input.recipients.length; i++) {
    const recipient = input.recipients[i]!;
    const email = recipient.email?.trim().toLowerCase();
    if (!email) continue;

    const existingCertificate = existingByEmail.get(email);
    if (existingCertificate?.mailed && !input.resend) {
      skipped++;
      continue;
    }

    const record =
      existingCertificate ??
      (await prisma.issuedCertificates.create({
        data: {
          eventId: resolvedEventId,
          certificateId: template.id,
          email,
          fields: template.fields as Prisma.InputJsonValue[],
          fieldValues: {
            ...(recipient.fieldValues ?? {}),
            ...(!template.template.startsWith("data:") ? { _templateUrl: template.template } : {}),
          } as Prisma.InputJsonValue,
          mailed: false,
        },
      }));
    if (!existingCertificate) {
      issued++;
      existingByEmail.set(email, record);
    }

    const recipientName = recipient.fieldValues?.name || email;

    // Generate certificate image buffer via sharp using pre-loaded template buffer
    const certBuffer = await compositeCertificate({
      templateBuffer,
      templateUrl: template.template,
      fields: (template.fields as unknown as CertificateField[]) || [],
      fieldValues: (recipient.fieldValues as Record<string, string>) || { name: recipientName },
      certificateId: record.id,
    });

    const result = await sendCertificateEmail({
      to: email,
      name: recipientName,
      eventName: event.name,
      certificateId: record.id,
      subject: input.subject,
      body: input.body,
      attachmentBuffer: certBuffer,
    });

    if (result.sent) {
      mailed++;
      await prisma.issuedCertificates.update({
        where: { id: record.id },
        data: { mailed: true },
      });
    } else {
      failures.push({ email, error: result.reason });
    }

    // Gentle pacing delay between recipients to avoid triggering rate limit bursts
    if (i < input.recipients.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { issued, skipped, mailed, failures, total: input.recipients.length };
}
