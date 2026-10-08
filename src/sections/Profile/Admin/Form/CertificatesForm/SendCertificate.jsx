"use client";

import { useState, useEffect, useContext, useRef, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as XLSX from "xlsx";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../../../../services";
import {
  getCertificatePreview,
  generatedAndSendCertificate,
  testCertificateSending,
} from "./tools/certificateTools";
import { Alert, MicroLoading } from "../../../../../microInteraction";
import AuthContext from "../../../../../context/AuthContext";
import styles from "./styles/SendCertificate.module.scss";

const SendCertificate = ({ eventId: propEventId } = {}) => {
  const authCtx = useContext(AuthContext);
  const params = useParams();
  const fileInputRef = useRef(null);

  const routeEventId = params?.id ?? params?.eventId ?? params?.formId;
  const eventId = propEventId || routeEventId;

  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [certificatePreview, setCertificatePreview] = useState(null);
  const [fields, setFields] = useState([]);
  const [templateAspectRatio, setTemplateAspectRatio] = useState(null);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const canvasRef = useRef(null);

  const [attendees, setAttendees] = useState([]);
  const [checkedAttendees, setCheckedAttendees] = useState([]);
  const [attendeeFilterText, setAttendeeFilterText] = useState("");
  const [checkedFilterText, setCheckedFilterText] = useState("");

  const [subject, setSubject] = useState("Certificate of Appreciation");
  const [body, setBody] = useState("");
  const [mailFrequency, setMailFrequency] = useState(20);

  const [alert, setAlert] = useState(null);
  const [failedEmails, setFailedEmails] = useState([]);
  const [deliveryError, setDeliveryError] = useState("");
  const [isFailedMinimized, setIsFailedMinimized] = useState(false);

  // ResizeObserver for canvasWidth to scale field font sizes proportionally
  useEffect(() => {
    if (!canvasRef.current) return;
    const updateSize = () => {
      if (canvasRef.current) {
        setCanvasWidth(canvasRef.current.clientWidth || 800);
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [certificatePreview]);

  // Synchronize alerts with toast system
  useEffect(() => {
    if (alert) {
      Alert(alert);
      setAlert(null);
    }
  }, [alert]);

  // Fetch certificate preview template and fields whenever eventId changes
  useEffect(() => {
    setCertificatePreview(null);
    setFields([]);
    setTemplateAspectRatio(null);
    setAttendees([]);
    setCheckedAttendees([]);
    setFailedEmails([]);
    setDeliveryError("");

    if (!eventId || eventId === "undefined" || eventId === "null") {
      setAlert({
        type: "error",
        message: "Event ID is missing from this link.",
        position: "top-right",
        duration: 4000,
      });
      return;
    }

    let isMounted = true;
    const fetchPreview = async () => {
      setPreviewLoading(true);
      try {
        const response = await api.post(
          "/api/certificate/dummyCertificate",
          { eventId },
          { headers: { Authorization: `Bearer ${authCtx.token}` } }
        );
        if (!isMounted) return;

        if (response.data?.template) {
          setCertificatePreview(response.data.template);
          if (Array.isArray(response.data.fields)) {
            setFields(response.data.fields);
          } else {
            setFields([]);
          }
        } else {
          setCertificatePreview(null);
          setFields([]);
        }
      } catch (error) {
        if (!isMounted) return;
        setCertificatePreview(null);
        setFields([]);
        setAlert({
          type: "error",
          message:
            error.response?.data?.message ||
            "Failed to load certificate preview. Save a certificate template first.",
          position: "top-right",
          duration: 3000,
        });
      } finally {
        if (isMounted) setPreviewLoading(false);
      }
    };

    fetchPreview();
    return () => {
      isMounted = false;
    };
  }, [eventId, authCtx.token]);

  // File Upload Handler (XLSX, XLS, CSV)
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];

    const isCsvOrExcel =
      allowedTypes.includes(file.type) ||
      /\.(xlsx|xls|csv)$/i.test(file.name);

    if (!isCsvOrExcel) {
      setAlert({
        type: "error",
        message: "Please upload an Excel file (.xlsx, .xls) or CSV file.",
        position: "top-right",
        duration: 3000,
      });
      return;
    }

    setFileUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          const validRows = (jsonData || []).filter(
            (row) => row && typeof row === "object" && Object.keys(row).length > 0
          );

          if (validRows.length === 0) {
            throw new Error("Uploaded file is empty.");
          }

          const extractedAttendees = [];
          for (const row of validRows) {
            const email =
              row.email ||
              row.Email ||
              row.EMAIL ||
              row["Email Address"] ||
              row["email address"];
            const name =
              row.name ||
              row.Name ||
              row.NAME ||
              row["Full Name"] ||
              row["full name"] ||
              "";

            if (email && typeof email === "string" && email.trim()) {
              extractedAttendees.push({
                email: email.trim(),
                name: typeof name === "string" ? name.trim() : String(name || "").trim(),
              });
            }
          }

          if (extractedAttendees.length === 0) {
            throw new Error("Could not find an 'Email' column in the uploaded file.");
          }

          // Merge uniquely by email
          setAttendees((prev) => {
            const existingMap = new Map(prev.map((a) => [a.email.toLowerCase(), a]));
            for (const att of extractedAttendees) {
              existingMap.set(att.email.toLowerCase(), att);
            }
            return Array.from(existingMap.values());
          });

          // Auto-select newly loaded attendees if none were selected previously
          setCheckedAttendees((prev) => {
            if (prev.length === 0) {
              return extractedAttendees;
            }
            return prev;
          });

          setAlert({
            type: "success",
            message: `Successfully loaded ${extractedAttendees.length} attendees.`,
            position: "top-right",
            duration: 3000,
          });
        } catch (parseError) {
          setAlert({
            type: "error",
            message: parseError.message || "Failed to process file contents.",
            position: "top-right",
            duration: 3500,
          });
        } finally {
          setFileUploading(false);
        }
      };

      reader.onerror = () => {
        setAlert({
          type: "error",
          message: "Failed to read the selected file.",
          position: "top-right",
          duration: 3000,
        });
        setFileUploading(false);
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      setAlert({
        type: "error",
        message: error.message || "Failed to process uploaded file.",
        position: "top-right",
        duration: 3000,
      });
      setFileUploading(false);
    }
  };

  // Attendee Selection Handlers
  const handleToggleAttendee = (attendee) => {
    setCheckedAttendees((prev) => {
      const exists = prev.some((a) => a.email.toLowerCase() === attendee.email.toLowerCase());
      if (exists) {
        return prev.filter((a) => a.email.toLowerCase() !== attendee.email.toLowerCase());
      } else {
        return [...prev, attendee];
      }
    });
  };

  const handleUncheckAttendee = (attendee) => {
    setCheckedAttendees((prev) =>
      prev.filter((a) => a.email.toLowerCase() !== attendee.email.toLowerCase())
    );
  };

  // Filter lists
  const filterByQuery = (list, filterText) => {
    const q = filterText.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) =>
        a.email.toLowerCase().includes(q) ||
        (a.name && a.name.toLowerCase().includes(q))
    );
  };

  const filteredAttendees = useMemo(
    () => filterByQuery(attendees, attendeeFilterText),
    [attendees, attendeeFilterText]
  );

  const filteredCheckedAttendees = useMemo(
    () => filterByQuery(checkedAttendees, checkedFilterText),
    [checkedAttendees, checkedFilterText]
  );

  const handleSelectAllAttendees = () => {
    if (attendees.length === 0) return;
    if (attendeeFilterText.trim()) {
      const newItems = filteredAttendees.filter(
        (fa) => !checkedAttendees.some((ca) => ca.email.toLowerCase() === fa.email.toLowerCase())
      );
      setCheckedAttendees((prev) => [...prev, ...newItems]);
      setAlert({
        type: "success",
        message: `Selected ${newItems.length} matching attendee(s)`,
        position: "top-right",
        duration: 2000,
      });
    } else {
      setCheckedAttendees([...attendees]);
      setAlert({
        type: "success",
        message: `Selected all ${attendees.length} attendees`,
        position: "top-right",
        duration: 2000,
      });
    }
  };

  const handleDeselectAllAttendees = () => {
    if (attendeeFilterText.trim()) {
      const filteredEmails = new Set(filteredAttendees.map((a) => a.email.toLowerCase()));
      setCheckedAttendees((prev) =>
        prev.filter((a) => !filteredEmails.has(a.email.toLowerCase()))
      );
    } else {
      setCheckedAttendees([]);
    }
    setAlert({
      type: "info",
      message: "Attendees deselected",
      position: "top-right",
      duration: 2000,
    });
  };

  const handleCopyRecipientEmails = () => {
    if (checkedAttendees.length === 0) return;
    const emails = checkedAttendees.map((a) => a.email).join(", ");
    navigator.clipboard?.writeText(emails);
    setAlert({
      type: "success",
      message: `Copied ${checkedAttendees.length} email(s) to clipboard`,
      position: "top-right",
      duration: 2000,
    });
  };

  // Test Email Handler
  const handleTestMail = async () => {
    if (!eventId) {
      setAlert({
        type: "error",
        message: "Event ID is missing from URL.",
        position: "top-right",
        duration: 4000,
      });
      return;
    }

    if (checkedAttendees.length === 0) {
      setAlert({
        type: "warning",
        message: "Please select at least one recipient for test email.",
        position: "top-right",
        duration: 3000,
      });
      return;
    }

    setSendingMail(true);
    setDeliveryError("");
    try {
      const testRecipient = checkedAttendees[0];
      const response = await testCertificateSending({
        eventId,
        email: testRecipient.email,
        name: testRecipient.name || "",
        subject: `[TEST] ${subject}`,
        body,
        token: authCtx.token,
      });

      if (response && response.status === 200) {
        setAlert({
          type: "success",
          message: `Test email sent to ${testRecipient.email}!`,
          position: "top-right",
          duration: 3000,
        });
      } else {
        throw new Error(
          response?.data?.message ||
          response?.data?.error ||
          "Failed to dispatch test email."
        );
      }
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      setDeliveryError(message);
      setAlert({
        type: "error",
        message: "Test mail failed: " + message,
        position: "top-right",
        duration: 3000,
      });
    } finally {
      setSendingMail(false);
    }
  };

  // Batch Certificate Send Handler
  const handleSendBatchMail = async () => {
    if (!eventId) {
      setAlert({
        type: "error",
        message: "Event ID is missing. Please open this page from the certificate list.",
        position: "top-right",
        duration: 4000,
      });
      return;
    }

    if (!certificatePreview) {
      setAlert({
        type: "warning",
        message: "No certificate template found. Please create and save one in the Studio first.",
        position: "top-right",
        duration: 4000,
      });
      return;
    }

    if (checkedAttendees.length === 0) {
      setAlert({
        type: "warning",
        message: "Please select at least one recipient to send certificates.",
        position: "top-right",
        duration: 3000,
      });
      return;
    }

    setSendingMail(true);
    setFailedEmails([]);
    setDeliveryError("");

    try {
      const CHUNK_SIZE = 15;
      const allRecipients = checkedAttendees.map((attendee) => ({
        email: attendee.email,
        name: attendee.name || "",
      }));

      const allFailed = [];
      let totalMailed = 0;
      const totalBatches = Math.ceil(allRecipients.length / CHUNK_SIZE);

      for (let i = 0; i < allRecipients.length; i += CHUNK_SIZE) {
        const chunk = allRecipients.slice(i, i + CHUNK_SIZE);
        const currentBatch = Math.floor(i / CHUNK_SIZE) + 1;

        if (totalBatches > 1) {
          setAlert({
            type: "info",
            message: `Dispatching batch ${currentBatch} of ${totalBatches} (${Math.min(i + CHUNK_SIZE, allRecipients.length)}/${allRecipients.length})...`,
            position: "top-right",
            duration: 3000,
          });
        }

        const response = await generatedAndSendCertificate({
          eventId,
          attendees: chunk,
          subject,
          body,
          frequency: Number(mailFrequency) || 20,
          token: authCtx.token,
        });

        if (response?.status === 200) {
          totalMailed += chunk.length;
        } else if (response?.status === 207) {
          const failed = response.data?.failed || [];
          allFailed.push(...failed);
          totalMailed += chunk.length - failed.length;
        } else {
          throw new Error(
            response?.data?.message ||
            response?.data?.error ||
            `Failed to send certificates in batch ${currentBatch}.`
          );
        }
      }

      if (allFailed.length > 0) {
        setFailedEmails(allFailed);
        setAlert({
          type: "warning",
          message: `${allFailed.length} certificate(s) failed to send.`,
          position: "top-right",
          duration: 5000,
        });
      } else {
        setAlert({
          type: "success",
          message: `All ${totalMailed} certificates dispatched successfully!`,
          position: "top-right",
          duration: 4000,
        });
      }
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      setDeliveryError(message);
      setAlert({
        type: "error",
        message: "Delivery error: " + message,
        position: "top-right",
        duration: 4000,
      });
    } finally {
      setSendingMail(false);
    }
  };

  const handleRetryFailed = () => {
    const failedAttendeeEmails = failedEmails.map((f) => f.email.toLowerCase());
    const failedAttendees = failedAttendeeEmails
      .map((email) => {
        const existing = attendees.find((a) => a.email.toLowerCase() === email);
        return existing || { email, name: "" };
      })
      .filter((fa) => !checkedAttendees.some((ca) => ca.email.toLowerCase() === fa.email.toLowerCase()));

    setCheckedAttendees((prev) => [...prev, ...failedAttendees]);
    setAlert({
      type: "info",
      message: `${failedAttendees.length} failed recipient(s) added back to dispatch queue`,
      position: "top-right",
      duration: 3000,
    });
  };

  return (
    <div className={styles.studioWrapper}>
      {/* Studio Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.headingGroup}>
          <h1 className={styles.title}>
            Send <span>Certificates</span>
          </h1>
          <div className={styles.eventBadge}>
            Event ID: <span className={styles.badgeId}>{eventId || "—"}</span>
          </div>
        </div>

        <div className={styles.actionGroup}>
          {eventId && (
            <Link
              href={`/profile/events/createCertificates/${eventId}`}
              className={styles.secondaryBtn}
            >
              Edit Template
            </Link>
          )}
        </div>
      </div>

      {/* 2-Column Responsive Workspace Grid */}
      <div className={styles.workspaceGrid}>
        {/* Left Column: Preview + Selected Recipients */}
        <div className={styles.column}>
          {/* Certificate Template Preview Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <h3 className={styles.cardTitle}>Certificate Preview</h3>
              </div>

              <div className={styles.headerActions}>
                {certificatePreview ? (
                  <span className={styles.statusReadyBadge}>Template Ready</span>
                ) : (
                  <span className={styles.statusPendingBadge}>No Template</span>
                )}
              </div>
            </div>

            <div className={styles.cardBody}>
              <div className={styles.previewWrapper}>
                {previewLoading ? (
                  <div className={styles.previewLoadingState}>
                    <MicroLoading />
                    <span>Loading certificate template...</span>
                  </div>
                ) : certificatePreview ? (
                  <div
                    ref={canvasRef}
                    className={styles.previewCanvas}
                    style={templateAspectRatio ? { aspectRatio: `${templateAspectRatio}` } : {}}
                  >
                    <img
                      src={certificatePreview}
                      alt="Certificate Template Preview"
                      className={styles.previewTemplateImage}
                      onLoad={(e) => {
                        if (e.target.naturalWidth && e.target.naturalHeight) {
                          setTemplateAspectRatio(e.target.naturalWidth / e.target.naturalHeight);
                        }
                      }}
                    />

                    {/* Display Configured Fields (Read-Only) */}
                    {fields.map((field, idx) => {
                      const isQr = field.fieldName?.trim().toLowerCase() === "qr";
                      if (isQr) {
                        const baseSize = Number(field.fontSize) || 80;
                        const displaySize = Math.max(
                          26,
                          Math.round(baseSize * (canvasWidth / 800))
                        );

                        return (
                          <div
                            key={idx}
                            className={styles.staticQrNode}
                            style={{
                              left: `${Number(field.x) || 85}%`,
                              top: `${Number(field.y) || 80}%`,
                              width: `${displaySize}px`,
                              height: `${displaySize}px`,
                            }}
                          >
                            <QRCodeSVG
                              value="https://fedkiit.com"
                              size={Math.max(16, displaySize - 6)}
                              fgColor={field.fontColor || field.color || "#000000"}
                              bgColor="transparent"
                            />
                          </div>
                        );
                      }

                      const displayFontSize = Math.max(
                        8,
                        Math.round((Number(field.fontSize) || 22) * (canvasWidth / 800))
                      );

                      return (
                        <div
                          key={idx}
                          className={styles.staticFieldNode}
                          style={{
                            left: `${Number(field.x) || 50}%`,
                            top: `${Number(field.y) || 50}%`,
                            color: field.fontColor || field.color || "#000000",
                            fontSize: `${displayFontSize}px`,
                          }}
                        >
                          <span className={styles.staticFieldText}>
                            {field.fieldName || "Name"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.previewEmptyState}>
                    <div className={styles.emptyIcon}>📜</div>
                    <h4>No Certificate Template Found</h4>
                    <p>
                      Please design and save a certificate template in the Certificate
                      Studio before dispatching.
                    </p>
                    {eventId && (
                      <Link
                        href={`/profile/events/createCertificates/${eventId}`}
                        className={styles.smallAccentBtn}
                        style={{ marginTop: 8 }}
                      >
                        Open Studio
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selected Recipients Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <h3 className={styles.cardTitle}>Selected Recipients</h3>
                <span className={styles.counterBadge}>
                  {checkedAttendees.length} selected
                </span>
              </div>

              <div className={styles.headerActions}>
                {checkedAttendees.length > 0 && (
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={handleCopyRecipientEmails}
                    title="Copy selected emails to clipboard"
                  >
                    Copy Emails
                  </button>
                )}
              </div>
            </div>

            <div className={styles.cardBody}>
              {/* Filter Selected */}
              <div className={styles.filterBar}>
                <input
                  type="text"
                  placeholder="Filter selected recipients..."
                  value={checkedFilterText}
                  onChange={(e) => setCheckedFilterText(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              {/* Scrollable Selected List */}
              <div className={styles.listContainer}>
                {filteredCheckedAttendees.length > 0 ? (
                  filteredCheckedAttendees.map((attendee) => (
                    <div
                      key={attendee.email}
                      className={styles.attendeeRow}
                    >
                      <div className={styles.attendeeMain}>
                        <div className={styles.attendeeText}>
                          <span className={styles.attendeeName}>
                            {attendee.name || "Recipient"}
                          </span>
                          <span className={styles.attendeeEmail}>
                            {attendee.email}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyListNotice}>
                    {checkedAttendees.length === 0
                      ? "No recipients selected yet. Check attendees from the list or upload a file."
                      : "No selected recipients match your search."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Attendees List & Import + Email Dispatch */}
        <div className={styles.column}>
          {/* Attendees List & Import Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <h3 className={styles.cardTitle}>Import Recipients</h3>
                <span className={styles.counterBadge}>
                  {attendees.length} loaded
                </span>
              </div>

              <div className={styles.headerActions}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                  onClick={(e) => {
                    e.target.value = null;
                  }}
                />
                <button
                  type="button"
                  className={styles.smallAccentBtn}
                  disabled={fileUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {fileUploading ? <MicroLoading /> : "Upload File"}
                </button>
              </div>
            </div>

            <div className={styles.cardBody}>
              <span className={styles.uploadHint}>
                Supports <code>.xlsx</code>, <code>.xls</code>, or <code>.csv</code> with an Email column
              </span>

              {/* Attendee Controls & Search */}
              <div className={styles.filterBar}>
                <input
                  type="text"
                  placeholder="Search attendees by name or email..."
                  value={attendeeFilterText}
                  onChange={(e) => setAttendeeFilterText(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              <div className={styles.bulkActionsRow}>
                <span>
                  Showing {filteredAttendees.length} of {attendees.length}
                </span>
                <div className={styles.buttonGroup}>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={handleSelectAllAttendees}
                    disabled={filteredAttendees.length === 0}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={handleDeselectAllAttendees}
                    disabled={checkedAttendees.length === 0}
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Scrollable Attendees Checklist */}
              <div className={styles.listContainer}>
                {filteredAttendees.length > 0 ? (
                  filteredAttendees.map((attendee) => {
                    const isChecked = checkedAttendees.some(
                      (a) => a.email.toLowerCase() === attendee.email.toLowerCase()
                    );
                    return (
                      <div
                        key={attendee.email}
                        className={`${styles.attendeeRow} ${isChecked ? styles.rowChecked : ""
                          }`}
                        onClick={() => handleToggleAttendee(attendee)}
                      >
                        <div className={styles.attendeeMain}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => { }} // handled by row click
                            className={styles.checkboxInput}
                          />
                          <div className={styles.attendeeText}>
                            <span className={styles.attendeeName}>
                              {attendee.name || "Attendee"}
                            </span>
                            <span className={styles.attendeeEmail}>
                              {attendee.email}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyListNotice}>
                    {attendees.length === 0
                      ? "No attendees loaded yet. Upload an Excel or CSV file above."
                      : "No attendees match your search query."}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Email Configuration & Dispatch Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <h3 className={styles.cardTitle}>Email Configuration</h3>
                {checkedAttendees.length > 0 ? (
                  <span className={styles.statusReadyBadge}>Ready to Dispatch</span>
                ) : (
                  <span className={styles.statusPendingBadge}>Select Recipients</span>
                )}
              </div>
            </div>

            <div className={styles.cardBody}>
              {/* Email Subject */}
              <div className={styles.formGroup}>
                <div className={styles.labelRow}>
                  <label htmlFor="email-subject">Subject</label>
                </div>
                <input
                  id="email-subject"
                  type="text"
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              {/* Email Body / Description */}
              <div className={styles.formGroup}>
                <div className={styles.labelRow}>
                  <label htmlFor="email-body">Description</label>
                </div>
                <textarea
                  id="email-body"
                  rows={4}
                  placeholder="Enter email message body..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <span className={styles.fieldHint}>
                  Use <code>&#123;name&#125;</code> to dynamically insert each recipient's name.
                </span>
              </div>

              {/* Mail Frequency */}
              <div className={styles.formGroup}>
                <div className={styles.labelRow}>
                  <label htmlFor="email-frequency">Dispatch Rate / Frequency (ms)</label>
                </div>
                <input
                  id="email-frequency"
                  type="number"
                  min="0"
                  step="5"
                  placeholder="20"
                  value={mailFrequency}
                  onChange={(e) => setMailFrequency(e.target.value)}
                />
                <span className={styles.fieldHint}>
                  Batch delay between emails in milliseconds (default: 20ms).
                </span>
              </div>

              {/* Dispatch Summary Indicator */}
              <div className={styles.dispatchSummaryBox}>
                <div className={styles.summaryLeft}>
                  <span
                    className={`${styles.statusDot} ${checkedAttendees.length > 0 && certificatePreview
                      ? styles.ready
                      : ""
                      }`}
                  />
                  <span>
                    {checkedAttendees.length > 0
                      ? `${checkedAttendees.length} recipient(s) queued`
                      : "0 recipients queued"}
                  </span>
                </div>
                <div className={styles.summaryRight}>
                  {checkedAttendees.length > 0
                    ? `~${Math.max(
                      1,
                      Math.ceil((checkedAttendees.length * (Number(mailFrequency) || 20)) / 1000)
                    )}s estimated`
                    : "Idle"}
                </div>
              </div>

              {/* Delivery Error Alert */}
              {deliveryError && (
                <div className={styles.deliveryErrorBanner} role="alert">
                  ⚠ {deliveryError}
                </div>
              )}

              {/* Action Buttons */}
              <div className={styles.actionBtnRow}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={handleTestMail}
                  disabled={sendingMail || checkedAttendees.length === 0}
                  title="Send a sample email to the first selected recipient"
                >
                  {sendingMail ? <MicroLoading /> : "Test Mail"}
                </button>

                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={handleSendBatchMail}
                  disabled={
                    sendingMail ||
                    checkedAttendees.length === 0 ||
                    !certificatePreview
                  }
                  title={
                    !certificatePreview
                      ? "Please save a certificate template first"
                      : checkedAttendees.length === 0
                        ? "Please select at least one recipient"
                        : "Send certificates to all selected recipients"
                  }
                >
                  {sendingMail ? (
                    <MicroLoading />
                  ) : (
                    `Send Certificates (${checkedAttendees.length})`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Failed Deliveries Console */}
      {failedEmails.length > 0 && (
        <div className={styles.failedCard}>
          <div className={styles.failedHeader}>
            <h4 className={styles.failedTitle}>
              ⚠ Delivery Issues ({failedEmails.length} failed)
            </h4>

            <div className={styles.failedActions}>
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => setIsFailedMinimized((prev) => !prev)}
              >
                {isFailedMinimized ? "Expand" : "Minimize"}
              </button>
              <button
                type="button"
                className={styles.smallAccentBtn}
                onClick={handleRetryFailed}
              >
                Retry Failed
              </button>
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => setFailedEmails([])}
              >
                Dismiss
              </button>
            </div>
          </div>

          {!isFailedMinimized && (
            <div className={styles.failedList}>
              {failedEmails.map((item, idx) => (
                <div key={idx} className={styles.failedItem}>
                  <span className={styles.failedEmail}>{item.email}</span>
                  <span className={styles.failedReason}>
                    {item.error || "Unknown delivery error"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SendCertificate;
