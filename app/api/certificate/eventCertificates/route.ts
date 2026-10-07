import { getCurrentUser, isAdmin } from "@/lib/auth/access";
import { expressError, handle, json } from "@/lib/api/express";
import {
  deleteAllTrashedCertificates,
  deleteIssuedCertificate,
  deleteMultipleIssuedCertificates,
  getEventIssuedCertificates,
  restoreAllTrashedCertificates,
  restoreIssuedCertificate,
  restoreMultipleIssuedCertificates,
  trashIssuedCertificate,
} from "@/lib/services/certificates";

/**
 * GET /api/certificate/eventCertificates?eventId=<id>
 * Admin-only route to retrieve all issued certificates for a given event.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return expressError(401, "Token is required");
    if (!isAdmin(user)) return expressError(403, "Unauthorized");

    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId") || url.searchParams.get("id");
    if (!eventId) return expressError(400, "Event ID is required");

    const data = await getEventIssuedCertificates(eventId);
    return json(data);
  });
}

/**
 * POST /api/certificate/eventCertificates
 * Admin-only route for certificate actions (e.g. restore from trash, restore all).
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return expressError(401, "Token is required");
    if (!isAdmin(user)) return expressError(403, "Unauthorized");

    const body = await request.json().catch(() => ({}));
    const action = body.action || "restore";
    const id = body.id || body.certificateId;
    const eventId = body.eventId;
    const ids = Array.isArray(body.ids) ? body.ids : id ? [id] : [];

    if (action === "restoreAll") {
      if (ids.length > 0) {
        const res = await restoreMultipleIssuedCertificates(ids);
        return json({ message: "Certificates restored successfully", count: res.restoredCount });
      } else if (eventId) {
        const res = await restoreAllTrashedCertificates(eventId);
        return json({ message: "All trashed certificates restored successfully", count: res.restoredCount });
      } else {
        return expressError(400, "Event ID or certificate IDs required to restore all");
      }
    }

    if (action === "restore") {
      if (!id) return expressError(400, "Certificate ID is required");
      await restoreIssuedCertificate(id);
      return json({ message: "Certificate restored successfully", id });
    }

    return expressError(400, "Unknown action");
  });
}

/**
 * DELETE /api/certificate/eventCertificates?id=<certificateId>&permanent=(true|false)
 * Or ?allTrash=true&permanent=true&eventId=<eventId>
 * Admin-only route to soft-delete (trash) or permanently delete issued certificates.
 */
export async function DELETE(request: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return expressError(401, "Token is required");
    if (!isAdmin(user)) return expressError(403, "Unauthorized");

    const url = new URL(request.url);
    const id = url.searchParams.get("id") || url.searchParams.get("certificateId");
    const eventId = url.searchParams.get("eventId");
    const allTrash = url.searchParams.get("allTrash") === "true";
    const permanent = url.searchParams.get("permanent") === "true";

    // Bulk permanent deletion of all trashed certificates
    if (allTrash && permanent) {
      if (eventId) {
        const res = await deleteAllTrashedCertificates(eventId);
        return json({ message: "All trashed certificates permanently deleted", count: res.deletedCount });
      } else {
        return expressError(400, "Event ID is required to delete all from trash");
      }
    }

    if (!id) return expressError(400, "Certificate ID is required");

    if (permanent) {
      await deleteIssuedCertificate(id);
      return json({ message: "Certificate permanently deleted", id, permanent: true });
    } else {
      await trashIssuedCertificate(id);
      return json({ message: "Certificate moved to trash", id, permanent: false });
    }
  });
}
