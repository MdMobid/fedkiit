/**
 * Role lists that both the server and the browser need.
 *
 * Deliberately free of `server-only` and of any Node import: the analytics
 * button in `EventsView` has to ask the same question the API asks, and it asks
 * it in the browser. When the two lists were written out separately they
 * disagreed — the route would have served a president that the table never
 * offered a button to.
 */

/**
 * May read a form's registration analytics.
 *
 * Copied from the Express controller's `allowedUsers`
 * (FED-Backend/controllers/forms/analytics.js). ADMIN is not listed because
 * `can()` grants it everything, matching `checkAccess`, where ADMIN always
 * passed — but the browser-side list needs it spelled out, so it is added in
 * `FORM_ANALYTICS_ROLES_CLIENT` below.
 */
export const FORM_ANALYTICS_ROLES = [
  "PRESIDENT",
  "VICEPRESIDENT",
  "DIRECTOR_CREATIVE",
  "DIRECTOR_TECHNICAL",
  "DIRECTOR_MARKETING",
  "DIRECTOR_OPERATIONS",
  // Not a member of the AccessTypes enum, so it can never match. Carried over
  // from the Express controller, where it was equally dead; kept so the list
  // stays a faithful copy rather than a silent narrowing. Note that this means
  // DIRECTOR_PR_AND_FINANCE and DIRECTOR_HUMAN_RESOURCE have never had
  // analytics access, on this stack or the previous one.
  "DIRECTOR_SPONSORSHIP",
] as const;

/** The same list with ADMIN spelled out, for client-side `includes()` checks. */
export const FORM_ANALYTICS_ROLES_CLIENT: readonly string[] = [
  ...FORM_ANALYTICS_ROLES,
  "ADMIN",
];
