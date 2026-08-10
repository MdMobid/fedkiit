"use client";

import { useContext, useEffect, useState } from "react";
import styles from "./styles/EventsView.module.scss";
import AuthContext from "../../../../context/AuthContext";

import { api } from "../../../../services";
import { ComponentLoading, MicroLoading } from "../../../../microInteraction";
import { FORM_ANALYTICS_ROLES_CLIENT } from "@/lib/auth/roles";
import Link from "next/link";

const Events = () => {
  const authCtx = useContext(AuthContext);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [certMap, setCertMap] = useState({});
  const [loadingCerts, setLoadingCerts] = useState(true); // New state for certificate loading

  // The public event page. There is no /profile/Events route, so the View
  // button in this table used to 404.
  const viewPath = "/Events";
  const analyticsPath = "/profile/events/Analytics";

  // Shared with the API route and the Analytics page, so the button cannot be
  // offered to someone the server will turn away — or withheld from someone it
  // would have served.
  const analyticsAccessRoles = FORM_ANALYTICS_ROLES_CLIENT;

  useEffect(() => {
    const fetchEventsData = async () => {
      try {
        const response = await api.get("/api/form/getAllForms");
        const userEvents = authCtx.user.regForm;

        if (response.status === 200) {
          let fetchedEvents = response.data.events;
          if (authCtx.user.access !== "USER") {
            // Set events for non-users
            setEvents(sortEventsByDate(fetchedEvents));
          } else {
            // Filter and then sort events for users
            const filteredEvents = fetchedEvents.filter((event) =>
              userEvents.includes(event.id)
            );
            setEvents(sortEventsByDate(filteredEvents));
          }
        } else {
          console.error("Error fetching event data:", response.data.message);
          setError({
            message:
              "Sorry for the inconvenience, we are having issues fetching your Events",
          });
        }
      } catch (error) {
        setError({
          message:
            "Sorry for the inconvenience, we are having issues fetching your Events",
        });
        console.error("Error fetching team members:", error);

        // const userEvents = authCtx.user.regForm;
        // // using local JSON data
        // let localEvents = eventsData.events;
        // if (authCtx.user.access !== "USER") {
        //   setEvents(sortEventsByDate(localEvents));
        // } else {
        //   const filteredEvents = localEvents.filter((event) =>
        // userEvents.includes(event._id);
        //   );
        //   setEvents(sortEventsByDate(filteredEvents));
        // }
      } finally {
        setIsLoading(false);
      }
    };

    fetchEventsData();
  }, [authCtx.user.email]);

  useEffect(() => {
    // Not admin-gated. This is the participant's own certificate list, and the
    // endpoint now authorises "your own email, or any email if you are an
    // admin" — gating it here left every ordinary member with an empty list and
    // a View button that led nowhere.
    const fetchCertificates = async () => {
      if (!authCtx.user?.email) return;

      try {
        const response = await api.post(
          "/api/certificate/sendCertificatesAndEvents",
          {
            email: authCtx.user.email,
          },
          {
            headers: { Authorization: `Bearer ${authCtx.token}` },
          }
        );
        if (response.status === 200) {
          setCertificates(response.data.certandevent);
        }
      } catch (err) {
        console.error("Error fetching certificates:", err);
      }
    };

    fetchCertificates();
  }, [authCtx.user?.email, authCtx.token]);

  /**
   * Certificates are issued against an `Event`, while this table lists forms,
   * so the two are matched on the `formId` the Event carries.
   *
   * This used to call `accessOrCreateEventByFormId`, which posts to
   * /api/certificate/getEventByFormId and falls back to
   * /api/certificate/createOrganisationEvent. Neither route was ever ported, so
   * every lookup 404'd, threw on `eid.id`, and left the map empty — a second,
   * independent reason the View button led nowhere. The joined event now comes
   * back with the certificate itself, so no extra request is needed.
   */
  const getCertificateForEvent = (formId) => {
    const found = certificates.find((item) => item.event?.formId === formId);
    return found ? found.cert : null;
  };

  const sortEventsByDate = (events) => {
    return events.sort(
      (a, b) => new Date(b.info.eventDate) - new Date(a.info.eventDate)
    );
  };

  const formatDate = (dateString) => {
    const options = { day: "2-digit", month: "2-digit", year: "numeric" };
    return new Date(dateString)
      .toLocaleDateString("en-GB", options)
      .replace(/\//g, "-");
  };

  // Pure lookups against data already in hand, so this is a plain synchronous
  // pass rather than one request per event.
  useEffect(() => {
    const map = {};
    for (const event of events) {
      const cert = getCertificateForEvent(event.id);
      if (cert) map[event.id] = `/verify/certificate?id=${cert.id}`;
    }
    setCertMap(map);
    setLoadingCerts(false);
  }, [events, certificates]);

  return (
    <div className={styles.participatedEvents}>
      {authCtx.user.access !== "USER" ? (
        <div className={styles.proHeading}>
          <h3 className={styles.headInnerText}>
            <span>Events</span> Timeline
          </h3>
        </div>
      ) : (
        <div className={styles.proHeading}>
          <h3 className={styles.headInnerText}>
            <span>Participated</span> Events
          </h3>
        </div>
      )}

      {isLoading ? (
        <ComponentLoading />
      ) : (
        <>
          {error && <div className={styles.error}>{error.message}</div>}

          <div className={styles.tables}>
            {events.length > 0 ? (
              <table className={styles.eventsTable}>
                <thead>
                  <tr>
                    <th className={styles.mobilewidth}>Event Name</th>
                    <th className={styles.mobilewidth}>Event Date</th>
                    <th className={styles.mobilewidth}>Details</th>
                    <th className={styles.mobilewidth}>Certificate</th>
                    {(analyticsAccessRoles.includes(authCtx.user.access) ||
                      authCtx.user.email == "srex@fedkiit.com") && (
                      <th
                        className={styles.mobilewidth}
                        style={{ paddingTop: "1rem" }}
                      >
                        Registrations
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {events.map((event) => (
                    <tr key={event._id || event.id}>
                      <td
                        className={styles.mobilewidth}
                        style={{ fontWeight: "500", paddingRight: "10px" }}
                      >
                        {event.info.eventTitle}
                      </td>
                      <td style={{ fontWeight: "200" }}>
                        {formatDate(event.info.eventDate)}
                      </td>

                      {/* View Event Details - accessible to all */}
                      <td>
                        <Link href={`${viewPath}/${event.id}`}>
                          <button
                            style={{
                              marginLeft: "auto",
                              whiteSpace: "nowrap",
                              height: "fit-content",
                              color: "orange",
                            }}
                          >
                            View
                          </button>
                        </Link>
                      </td>

                      {/* Certificate - only for USERS */}
                      {authCtx.user.access === "USER" && (
                        <td>
                          {loadingCerts ? (
                            <div>
                              <MicroLoading />
                            </div>
                          ) : certMap[event.id] ? (
                            <Link
                              href={certMap[event.id]}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <button>
                                View
                              </button>
                            </Link>
                          ) : (
                            <button
                              disabled
                              style={{ opacity: 0.5 }}
                            >
                              Not Issued
                            </button>
                          )}
                        </td>
                      )}

                      {/* Analytics - only for admins and specific roles */}
                      {(analyticsAccessRoles.includes(authCtx.user.access) ||
                        authCtx.user.email === "srex@fedkiit.com") && (
                        <td>
                          <Link href={`${analyticsPath}/${event.id}`}>
                            <button
                              style={{
                                marginLeft: "auto",
                                whiteSpace: "nowrap",
                                height: "fit-content",
                                color: "orange",
                              }}
                            >
                              View
                            </button>
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.noEvents}>Not participated in any Events</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Events;