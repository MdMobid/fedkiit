/**
 * The "locked" rule for events that require another event first.
 *
 * A form's `info.relatedEvent` holds the id of a prerequisite event. Until the
 * visitor has registered for that event, this one stays locked — the behaviour
 * the Express backend had, where the card reads "Locked" and registration is
 * refused.
 *
 * This is deliberately the same test the server applies in
 * app/api/form/register/route.ts, so the button and the API cannot disagree.
 *
 * It replaces a page-level `isRegisteredInRelatedEvents` boolean that both
 * /Events and the event detail page computed like this:
 *
 *   const relatedEventIds = ongoingEvents.map((e) => e.info.relatedEvent)…
 *   registeredInRelated = relatedEventIds.some((id) => registered.includes(id));
 *
 * That asked "is the visitor registered for *any* event that is a prerequisite
 * of *any* other event", then applied the answer to every card on the page. So
 * registering for one prerequisite silently unlocked every gated event on the
 * site, whatever its own prerequisite was. It also only ever set the flag true
 * and never back to false, so the state survived a change of events.
 */

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** True when the event names a real prerequisite event. */
export function hasPrerequisite(info) {
  const id = info?.relatedEvent;
  return Boolean(id && id !== "null" && OBJECT_ID.test(id));
}

/**
 * True when this specific event is open to this specific visitor.
 *
 * @param {object} info      The event's `info` object.
 * @param {string[]} regForm Ids of the forms the visitor has registered for.
 */
export function isPrerequisiteMet(info, regForm) {
  if (!hasPrerequisite(info)) return true;
  return Array.isArray(regForm) && regForm.includes(info.relatedEvent);
}
