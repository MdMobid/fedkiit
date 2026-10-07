"use client";

import { useState, useEffect, useContext, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../../services";
import { MicroLoading } from "../../../../../microInteraction";
import AuthContext from "../../../../../context/AuthContext";
import styles from "./styles/ViewCertificates.module.scss";

const ViewCertificates = ({ eventId: propEventId } = {}) => {
  const authCtx = useContext(AuthContext);
  const params = useParams();
  const routeEventId = params?.id ?? params?.eventId ?? params?.formId;
  const eventId = propEventId || routeEventId;

  const [data, setData] = useState({
    event: null,
    template: null,
    certificates: [],
    total: 0,
    totalMailed: 0,
    totalTrash: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL"); // ALL | MAILED | UNMAILED | TRASH
  const [copiedId, setCopiedId] = useState(null);
  const [copiedLinkId, setCopiedLinkId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(null);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      setError("Event ID is missing.");
      return;
    }

    let isMounted = true;
    const fetchCertificates = async () => {
      setLoading(true);
      try {
        const response = await api.get(
          `/api/certificate/eventCertificates?eventId=${encodeURIComponent(eventId)}`
        );
        if (isMounted) {
          setData(response.data || {});
          setError(null);
        }
      } catch (err) {
        console.error("Failed to load event certificates:", err);
        if (isMounted) {
          setError(err?.response?.data?.message || "Failed to load certificates.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCertificates();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  const handleCopyId = (certId) => {
    navigator?.clipboard?.writeText(certId);
    setCopiedId(certId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyLink = (certId) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/verify/certificate?id=${encodeURIComponent(certId)}`;
    navigator?.clipboard?.writeText(url);
    setCopiedLinkId(certId);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  // Move certificate to Trash (soft delete)
  const handleTrash = async (certId, recipientName) => {
    if (
      !window.confirm(
        `Move certificate for "${recipientName || certId}" to trash? It will become invalid on verification until restored.`
      )
    ) {
      return;
    }

    // Optimistic update: instantly move to trash in UI
    const previousCertificates = data.certificates;
    setData((prev) => ({
      ...prev,
      certificates: (prev.certificates || []).map((c) =>
        c.id === certId ? { ...c, isDeleted: true } : c
      ),
    }));

    try {
      await api.delete(`/api/certificate/eventCertificates?id=${encodeURIComponent(certId)}`);
    } catch (err) {
      console.error("Failed to move certificate to trash:", err);
      setData((prev) => ({ ...prev, certificates: previousCertificates }));
      alert(err?.response?.data?.message || "Failed to move certificate to trash.");
    }
  };

  // Restore certificate from Trash (un-delete)
  const handleRestore = async (certId, recipientName) => {
    if (
      !window.confirm(
        `Restore certificate for "${recipientName || certId}"? It will become valid and verifiable again.`
      )
    ) {
      return;
    }

    // Optimistic update: instantly restore in UI
    const previousCertificates = data.certificates;
    setData((prev) => ({
      ...prev,
      certificates: (prev.certificates || []).map((c) =>
        c.id === certId ? { ...c, isDeleted: false } : c
      ),
    }));

    try {
      await api.post("/api/certificate/eventCertificates", {
        action: "restore",
        id: certId,
      });
    } catch (err) {
      console.error("Failed to restore certificate:", err);
      setData((prev) => ({ ...prev, certificates: previousCertificates }));
      alert(err?.response?.data?.message || "Failed to restore certificate.");
    }
  };

  // Permanently delete certificate from database
  const handlePermanentDelete = async (certId, recipientName) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete the certificate for "${recipientName || certId}" from the database? This action CANNOT be undone.`
      )
    ) {
      return;
    }

    // Optimistic update: instantly remove from UI
    const previousCertificates = data.certificates;
    setData((prev) => ({
      ...prev,
      certificates: (prev.certificates || []).filter((c) => c.id !== certId),
    }));

    try {
      await api.delete(
        `/api/certificate/eventCertificates?id=${encodeURIComponent(certId)}&permanent=true`
      );
    } catch (err) {
      console.error("Failed to permanently delete certificate:", err);
      setData((prev) => ({ ...prev, certificates: previousCertificates }));
      alert(err?.response?.data?.message || "Failed to permanently delete certificate.");
    }
  };

  // Restore all trashed certificates
  const handleRestoreAll = async () => {
    const trashedCertificates = (data.certificates || []).filter((c) => c.isDeleted);
    if (trashedCertificates.length === 0) return;

    if (
      !window.confirm(
        `Are you sure you want to restore all ${trashedCertificates.length} certificate(s) from trash? They will become valid and verifiable again.`
      )
    ) {
      return;
    }

    const previousCertificates = data.certificates;
    // Optimistic update: instantly restore all in view
    setData((prev) => ({
      ...prev,
      certificates: (prev.certificates || []).map((c) =>
        c.isDeleted ? { ...c, isDeleted: false } : c
      ),
    }));

    setBulkActionLoading("restoreAll");
    try {
      const trashedIds = trashedCertificates.map((c) => c.id);
      await api.post("/api/certificate/eventCertificates", {
        action: "restoreAll",
        eventId,
        ids: trashedIds,
      });
    } catch (err) {
      console.error("Failed to restore all certificates:", err);
      setData((prev) => ({ ...prev, certificates: previousCertificates }));
      alert(err?.response?.data?.message || "Failed to restore all certificates.");
    } finally {
      setBulkActionLoading(null);
    }
  };

  // Permanently delete all trashed certificates
  const handleDeleteAll = async () => {
    const trashedCertificates = (data.certificates || []).filter((c) => c.isDeleted);
    if (trashedCertificates.length === 0) return;

    if (
      !window.confirm(
        `DANGER: Are you sure you want to permanently delete all ${trashedCertificates.length} certificate(s) in the trash from the database? This action CANNOT be undone.`
      )
    ) {
      return;
    }

    const previousCertificates = data.certificates;
    // Optimistic update: instantly remove all trashed from view
    setData((prev) => ({
      ...prev,
      certificates: (prev.certificates || []).filter((c) => !c.isDeleted),
    }));

    setBulkActionLoading("deleteAll");
    try {
      await api.delete(
        `/api/certificate/eventCertificates?eventId=${encodeURIComponent(
          eventId
        )}&allTrash=true&permanent=true`
      );
    } catch (err) {
      console.error("Failed to delete all certificates:", err);
      setData((prev) => ({ ...prev, certificates: previousCertificates }));
      alert(err?.response?.data?.message || "Failed to permanently delete all trashed certificates.");
    } finally {
      setBulkActionLoading(null);
    }
  };

  const { activeCount, mailedCount, unsentCount, trashCount } = useMemo(() => {
    const list = data.certificates || [];
    const active = list.filter((c) => !c.isDeleted);
    const trashed = list.filter((c) => c.isDeleted);
    return {
      activeCount: active.length,
      mailedCount: active.filter((c) => c.mailed).length,
      unsentCount: active.filter((c) => !c.mailed).length,
      trashCount: trashed.length,
    };
  }, [data.certificates]);

  const filteredCertificates = useMemo(() => {
    let list = data.certificates || [];

    if (filterStatus === "TRASH") {
      list = list.filter((c) => c.isDeleted);
    } else {
      list = list.filter((c) => !c.isDeleted);
      if (filterStatus === "MAILED") {
        list = list.filter((c) => c.mailed);
      } else if (filterStatus === "UNMAILED") {
        list = list.filter((c) => !c.mailed);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data.certificates, filterStatus, searchQuery]);

  const eventTitle = data.event?.name || "Event Certificates";

  return (
    <div className={styles.container}>
      {/* Top Header Bar */}
      <div className={styles.topBar}>
        <div className={styles.headerGroup}>
          <Link href="/profile/certificates" className={styles.backLink}>
            ← Back to Events
          </Link>
          <h2 className={styles.title}>
            <span>Generated</span> Certificates
          </h2>
          <div className={styles.metaRow}>
            <span className={styles.badge}>Event: {eventTitle}</span>
            <span className={styles.badge}>ID: {eventId}</span>
          </div>
        </div>

        <div className={styles.actionGroup}>
          <Link
            href={`/profile/events/createCertificates/${eventId}`}
            className={styles.secondaryBtn}
          >
            Studio Editor
          </Link>
          <Link
            href={`/profile/events/SendCertificate/${eventId}`}
            className={styles.primaryBtn}
          >
            Send Mails
          </Link>
        </div>
      </div>

      {/* Main Content Table Card */}
      <div className={styles.contentCard}>
        {/* Controls Bar */}
        <div className={styles.controlsBar}>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="Search recipient name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.filterTabs}>
            <button
              type="button"
              className={`${styles.tabBtn} ${filterStatus === "ALL" ? styles.activeTab : ""}`}
              onClick={() => setFilterStatus("ALL")}
            >
              All ({activeCount})
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${filterStatus === "MAILED" ? styles.activeTab : ""}`}
              onClick={() => setFilterStatus("MAILED")}
            >
              Mailed ({mailedCount})
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${filterStatus === "UNMAILED" ? styles.activeTab : ""}`}
              onClick={() => setFilterStatus("UNMAILED")}
            >
              Unsent ({unsentCount})
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${styles.trashTab} ${filterStatus === "TRASH" ? styles.activeTrashTab : ""
                }`}
              onClick={() => setFilterStatus("TRASH")}
            >
              Trash ({trashCount})
            </button>
          </div>
        </div>

        {/* Trash Actions Banner */}
        {filterStatus === "TRASH" && trashCount > 0 && (
          <div className={styles.trashBanner}>
            <div className={styles.trashBannerInfo}>
              <span className={styles.trashBadge}>{trashCount} in Trash</span>
              <span className={styles.trashNotice}>
                These certificates are invalid on verification until restored.
              </span>
            </div>
            <div className={styles.trashBulkActions}>
              <button
                type="button"
                className={styles.restoreAllBtn}
                onClick={handleRestoreAll}
                disabled={bulkActionLoading !== null}
                title="Restore all certificates from trash"
              >
                {bulkActionLoading === "restoreAll" ? "Restoring All..." : "Restore All"}
              </button>
              <button
                type="button"
                className={styles.deleteAllBtn}
                onClick={handleDeleteAll}
                disabled={bulkActionLoading !== null}
                title="Permanently delete all certificates in trash"
              >
                {bulkActionLoading === "deleteAll" ? "Deleting All..." : "Delete All"}
              </button>
            </div>
          </div>
        )}

        {/* Table / List View */}
        {loading ? (
          <div className={styles.loadingContainer}>
            <MicroLoading />
            <span>Loading generated certificates...</span>
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <h4>Error Loading Certificates</h4>
            <p>{error}</p>
          </div>
        ) : filteredCertificates.length > 0 ? (
          <div className={styles.tableWrapper}>
            <table className={styles.certTable}>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCertificates.map((cert) => (
                  <tr key={cert.id}>
                    <td>
                      <div className={styles.recipientCell}>
                        <span className={styles.recipientName}>{cert.name}</span>
                        <span className={styles.recipientEmail}>{cert.email}</span>
                      </div>
                    </td>
                    <td>
                      {cert.isDeleted ? (
                        <span className={`${styles.statusPill} ${styles.trashed}`}>
                          <span className={styles.dot} />
                          In Trash
                        </span>
                      ) : (
                        <span
                          className={`${styles.statusPill} ${cert.mailed ? styles.mailed : styles.unsent
                            }`}
                        >
                          <span className={styles.dot} />
                          {cert.mailed ? "Mailed" : "Not Mailed"}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className={styles.actionCell}>
                        {cert.isDeleted ? (
                          <>
                            <button
                              type="button"
                              className={styles.restoreBtn}
                              onClick={() => handleRestore(cert.id, cert.name)}
                              disabled={actionLoadingId === cert.id}
                              title="Restore certificate (makes it valid again)"
                            >
                              {actionLoadingId === cert.id ? "Restoring..." : "Restore"}
                            </button>
                            <button
                              type="button"
                              className={`${styles.copyIdBtn} ${copiedId === cert.id ? styles.copied : ""}`}
                              onClick={() => handleCopyId(cert.id)}
                              title="Copy certificate ID"
                            >
                              {copiedId === cert.id ? "Copied!" : "Copy ID"}
                            </button>
                            <button
                              type="button"
                              className={`${styles.copyLinkBtn} ${copiedLinkId === cert.id ? styles.copied : ""}`}
                              onClick={() => handleCopyLink(cert.id)}
                              title="Copy certificate verification link"
                            >
                              {copiedLinkId === cert.id ? "Copied!" : "Copy Link"}
                            </button>
                            <button
                              type="button"
                              className={styles.deletePermanentBtn}
                              onClick={() => handlePermanentDelete(cert.id, cert.name)}
                              disabled={actionLoadingId === cert.id}
                              title="Delete permanently from database"
                            >
                              {actionLoadingId === cert.id ? "Deleting..." : "Delete"}
                            </button>
                          </>
                        ) : (
                          <>
                            <a
                              href={`/verify/certificate?id=${encodeURIComponent(cert.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.viewBtn}
                              title="View verified certificate"
                            >
                              View
                            </a>
                            <button
                              type="button"
                              className={`${styles.copyIdBtn} ${copiedId === cert.id ? styles.copied : ""}`}
                              onClick={() => handleCopyId(cert.id)}
                              title="Copy certificate ID"
                            >
                              {copiedId === cert.id ? "Copied!" : "Copy ID"}
                            </button>
                            <button
                              type="button"
                              className={`${styles.copyLinkBtn} ${copiedLinkId === cert.id ? styles.copied : ""}`}
                              onClick={() => handleCopyLink(cert.id)}
                              title="Copy certificate verification link"
                            >
                              {copiedLinkId === cert.id ? "Copied!" : "Copy Link"}
                            </button>
                            <button
                              type="button"
                              className={styles.deleteBtn}
                              onClick={() => handleTrash(cert.id, cert.name)}
                              disabled={actionLoadingId === cert.id}
                              title="Move certificate to trash"
                            >
                              {actionLoadingId === cert.id ? "Trashing..." : "Delete"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h4>
              {filterStatus === "TRASH" ? "Trash is Empty" : "No Certificates Found"}
            </h4>
            <p>
              {filterStatus === "TRASH"
                ? "There are no deleted certificates in the trash."
                : activeCount === 0
                  ? "No certificates have been issued for this event yet. Import recipients and send certificates to issue them."
                  : "No certificates match your search query."}
            </p>
            {activeCount === 0 && filterStatus !== "TRASH" && (
              <Link
                href={`/profile/events/SendCertificate/${eventId}`}
                className={styles.primaryBtn}
                style={{ marginTop: "8px" }}
              >
                Send Certificates
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewCertificates;
