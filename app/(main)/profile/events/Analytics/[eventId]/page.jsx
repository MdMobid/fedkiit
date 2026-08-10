// Route entry for the per-event admin view — registration counts, year
// breakdown, the CSV export and the payment proofs.
//
// This route did not exist. `EventCard` has shipped an analytics button since
// the revamp that pushes to `/profile/events/Analytics/<id>`, and `EventStats`
// was written and exported from the modals barrel, but nothing ever mounted it
// — so the button 404'd and the component was dead code.
//
// Gated on the server, because `proxy.ts` only checks for a valid session, not
// a role — without this any signed-in participant who typed the path would see
// every registrant's email and payment screenshot.
//
// The gate is `canViewFormAnalytics`, the same rule the endpoint this page
// calls enforces. It was `isAdmin` at first, which was narrower than both the
// API and the Express-era route (`access !== "USER"` in App.jsx) — so a
// president or director was shown the Analytics button by EventsView, and then
// bounced back to /profile by this line when they clicked it.

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/access";
import { canViewFormAnalytics } from "@/lib/auth/permissions";
import EventStats from "@/src/features/Modals/Event/EventStats/EventStats";

export default async function Page({ params }) {
  const { eventId } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(`/Login?next=/profile/events/Analytics/${eventId}`);
  if (!canViewFormAnalytics(user)) redirect("/profile");

  return <EventStats onClosePath="/profile/events" />;
}
