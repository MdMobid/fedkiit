import { prisma } from "@/lib/db";
import { expressError, handle, json } from "@/lib/api/express";
import { getCurrentUser } from "@/lib/auth/access";
import { canViewFormAnalytics } from "@/lib/auth/permissions";

/**
 * GET /api/form/getFormAnalytics/:id
 * Port of controllers/forms/analytics.js.
 *
 * Response is `{ message, form, yearCounts }` at the top level, because
 * EventStats.jsx reads `response.data.form.formAnalytics`,
 * `response.data.form.info` and `response.data.yearCounts` directly.
 */

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/form/getFormAnalytics/[id]">,
) {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return expressError(401, "Token is required");

    // Role list and address allowlist both live in `lib/auth/permissions.ts`,
    // shared with the page that renders EventStats so the two cannot disagree.
    // 401 rather than 403, matching `ApiError(status.UNAUTHORIZED, ...)`.
    if (!canViewFormAnalytics(user)) {
      return expressError(401, "Access Denied");
    }

    const { id } = await ctx.params;
    // The original passed the id straight to Prisma; a non-ObjectId throws
    // there and surfaces as a 500. Screened here so it reads as "not found".
    if (!/^[a-f\d]{24}$/i.test(id)) return expressError(404, "Form not found");

    // The original wrote `include: { formAnalytics: true, sections: false }`.
    // `sections` is a scalar JSON column, not a relation, so listing it in
    // `include` never excluded anything — scalars come back regardless unless a
    // `select` says otherwise. Dropping it returns exactly the same row.
    const form = await prisma.form.findUnique({
      where: { id },
      include: { formAnalytics: true },
    });
    if (!form) return expressError(404, "Form not found");

    const formAnalytics = form.formAnalytics[0] || {
      count: 0,
      regUserEmails: [],
      teams: [],
      userData: [],
    };

    // Registrant counts bucketed by the first word of `year` ("2nd Year" -> "2nd").
    // A user with no year lands under the key "null", exactly as before: the
    // original initialised `year` to null and used it as the object key.
    let yearCounts: Record<string, number> | undefined;
    try {
      const users = await prisma.user.findMany({
        where: { email: { in: formAnalytics.regUserEmails } },
      });

      yearCounts = users.reduce<Record<string, number>>((acc, obj) => {
        let year: string | null = null;
        if (obj.year) year = obj.year.split(" ")[0];

        acc[year as string] = (acc[year as string] || 0) + 1;
        return acc;
      }, {});
    } catch (error) {
      // Matches the original: the failure is logged and the response still goes
      // out, with `yearCounts` undefined.
      console.error("Error fetching all the users form the array list", error);
    }

    return json({ message: "success", form, yearCounts });
  });
}
