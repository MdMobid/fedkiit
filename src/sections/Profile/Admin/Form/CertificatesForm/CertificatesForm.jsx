"use client";

import { useState, useEffect, useContext, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../../../../services";
import { getCertificatePreview } from "./tools/certificateTools";
import { Alert, MicroLoading } from "../../../../../microInteraction";
import AuthContext from "../../../../../context/AuthContext";
import styles from "./styles/CertificatesForm.module.scss";

const CertificatesForm = ({ eventId: propEventId } = {}) => {
  const authCtx = useContext(AuthContext);
  const params = useParams();
  const routeEventId = params?.id ?? params?.eventId ?? params?.formId;
  const eventId = propEventId || routeEventId;

  const [certificate, setCertificate] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [alert, setAlert] = useState(null);
  const [responseImg, setResponseImg] = useState("");
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(null);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [templateAspectRatio, setTemplateAspectRatio] = useState(null);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [allExpanded, setAllExpanded] = useState(false);

  const canvasRef = useRef(null);
  const cardRefs = useRef([]);
  const SendCertificatePath = "/profile/events/SendCertificate";

  useEffect(() => {
    if (selectedFieldIndex !== null && cardRefs.current[selectedFieldIndex]) {
      cardRefs.current[selectedFieldIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedFieldIndex]);

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
  }, [responseImg, certificate]);

  useEffect(() => {
    if (alert) {
      Alert(alert);
      setAlert(null);
    }
  }, [alert]);

  // Clean state isolation when switching eventId
  useEffect(() => {
    setCertificate(null);
    setCertificateFile(null);
    setFields([]);
    setResponseImg("");
    setSelectedFieldIndex(null);
    setIsPreviewMode(false);

    if (!eventId || eventId === "undefined" || eventId === "null") return;

    let isMounted = true;
    const fetchExistingTemplate = async () => {
      setLoading(true);
      try {
        const response = await api.post(
          "/api/certificate/dummyCertificate",
          { eventId },
          { headers: { Authorization: `Bearer ${authCtx.token}` } }
        );

        if (!isMounted) return;

        if (response.data?.template) {
          setResponseImg(response.data.template);
          if (Array.isArray(response.data.fields) && response.data.fields.length > 0) {
            setFields(
              response.data.fields.map((f) => ({
                fieldName: f.fieldName || "Name",
                x: Number(f.x ?? 50),
                y: Number(f.y ?? 50),
                fontSize: Number(f.fontSize ?? (f.fieldName?.toLowerCase() === "qr" ? 80 : 22)),
                fontColor: f.fontColor || f.color || "#000000",
                minimized: false,
              }))
            );
          } else {
            setFields([
              {
                fieldName: "Name",
                x: 50,
                y: 50,
                fontSize: 22,
                fontColor: "#000000",
                minimized: false,
              },
              {
                fieldName: "QR",
                x: 85,
                y: 80,
                fontSize: 80,
                fontColor: "#000000",
                minimized: false,
              },
            ]);
          }
        }
      } catch (err) {
        // No existing template saved yet — fresh start for event
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchExistingTemplate();
    return () => {
      isMounted = false;
    };
  }, [eventId, authCtx.token]);

  // Touch and Mouse Drag Handler (Mobile + Desktop friendly)
  const handlePointerMove = useCallback(
    (e) => {
      if (draggingIndex === null || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const rawX = ((clientX - rect.left) / rect.width) * 100;
      const rawY = ((clientY - rect.top) / rect.height) * 100;

      const clampedX = Math.min(96, Math.max(4, Math.round(rawX * 10) / 10));
      const clampedY = Math.min(96, Math.max(4, Math.round(rawY * 10) / 10));

      setFields((prev) => {
        const next = [...prev];
        if (next[draggingIndex]) {
          next[draggingIndex] = {
            ...next[draggingIndex],
            x: clampedX,
            y: clampedY,
          };
        }
        return next;
      });
    },
    [draggingIndex]
  );

  const handlePointerUp = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  useEffect(() => {
    if (draggingIndex !== null) {
      window.addEventListener("mousemove", handlePointerMove);
      window.addEventListener("mouseup", handlePointerUp);
      window.addEventListener("touchmove", handlePointerMove, { passive: false });
      window.addEventListener("touchend", handlePointerUp);
      return () => {
        window.removeEventListener("mousemove", handlePointerMove);
        window.removeEventListener("mouseup", handlePointerUp);
        window.removeEventListener("touchmove", handlePointerMove);
        window.removeEventListener("touchend", handlePointerUp);
      };
    }
  }, [draggingIndex, handlePointerMove, handlePointerUp]);

  const handleCertificateChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setAlert({
          type: "error",
          message: "Please upload a valid image file",
          position: "top-right",
          duration: 3000,
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawResult = event.target?.result;
        const img = new Image();
        img.onload = () => {
          const maxDim = 2400;
          let width = img.width;
          let height = img.height;

          let targetDataUrl = rawResult;
          // Scale down if image dimension exceeds 2400px or file is large (>2MB)
          if (width > maxDim || height > maxDim || file.size > 2 * 1024 * 1024) {
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            const format = file.type === "image/png" ? "image/png" : "image/jpeg";
            targetDataUrl = canvas.toDataURL(format, 0.92);
          }

          setCertificate(targetDataUrl);
          setResponseImg("");
          setFields((prev) => {
            if (prev.length === 0) {
              return [
                {
                  fieldName: "Name",
                  x: 50,
                  y: 50,
                  fontSize: 22,
                  fontColor: "#000000",
                  minimized: false,
                },
              ];
            }
            return prev;
          });
          setAlert({
            type: "success",
            message: "Certificate image uploaded successfully",
            position: "top-right",
            duration: 2000,
          });
        };
        img.onerror = () => {
          setCertificate(rawResult);
          setResponseImg("");
        };
        img.src = rawResult;
      };
      setCertificateFile(file);
      reader.readAsDataURL(file);
    }
  };

  const handleFieldChange = (index, key, value) => {
    const updatedFields = [...fields];
    updatedFields[index] = { ...updatedFields[index], [key]: value };
    setFields(updatedFields);
  };

  const handleNumericFieldChange = (index, key, rawValue) => {
    if (rawValue === "") {
      handleFieldChange(index, key, "");
      return;
    }
    // Strip leading zeros when multiple digits are typed (e.g. "05" -> 5) while allowing "0"
    const cleaned = String(rawValue).replace(/^0+(?=\d)/, "");
    const num = Number(cleaned);
    if (!isNaN(num)) {
      handleFieldChange(index, key, num);
    }
  };

  const handleNumericBlur = (index, key, min = 0, max = 100, defaultVal = 0) => {
    const val = fields[index]?.[key];
    if (val === "" || val === undefined || isNaN(Number(val))) {
      handleFieldChange(index, key, defaultVal);
    } else {
      const clamped = Math.min(max, Math.max(min, Number(val)));
      handleFieldChange(index, key, clamped);
    }
  };

  const addNewField = (name) => {
    const defaultName =
      name ||
      (fields.length === 0 || !fields.some((f) => f.fieldName?.toLowerCase() === "name")
        ? "Name"
        : !fields.some((f) => f.fieldName?.toLowerCase() === "qr")
          ? "QR"
          : `Field ${fields.length + 1}`);

    const isQr = defaultName.toLowerCase() === "qr";
    const newIdx = fields.length;
    setFields([
      ...fields,
      {
        fieldName: defaultName,
        x: isQr ? 85 : 50,
        y: isQr ? 80 : 50,
        fontSize: isQr ? 80 : 22,
        fontColor: "#000000",
        minimized: false,
      },
    ]);
    setSelectedFieldIndex(newIdx);
    setAlert({
      type: "info",
      message: `${defaultName} field placed. Drag to reposition.`,
      position: "top-right",
      duration: 2000,
    });
  };

  const toggleExpandAll = () => {
    if (allExpanded) {
      setAllExpanded(false);
      setSelectedFieldIndex(null);
    } else {
      setAllExpanded(true);
      setFields((prev) => prev.map((f) => ({ ...f, minimized: false })));
    }
  };

  const handleToggleExpand = (index) => {
    if (allExpanded) {
      handleFieldChange(index, "minimized", !fields[index]?.minimized);
    } else {
      if (selectedFieldIndex === index) {
        handleFieldChange(index, "minimized", !fields[index]?.minimized);
      } else {
        setSelectedFieldIndex(index);
        handleFieldChange(index, "minimized", false);
      }
    }
  };

  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
    if (selectedFieldIndex === index) {
      setSelectedFieldIndex(null);
    } else if (selectedFieldIndex > index) {
      setSelectedFieldIndex(selectedFieldIndex - 1);
    }
    setAlert({
      type: "info",
      message: "Field removed",
      position: "top-right",
      duration: 2000,
    });
  };

  const handleRefresh = async () => {
    if (!eventId) {
      setAlert({
        type: "error",
        message: "Event ID is missing from URL.",
        position: "top-right",
        duration: 4000,
      });
      return;
    }

    setPreviewLoading(true);
    try {
      const preview = await getCertificatePreview(eventId, authCtx.token);
      if (!preview) {
        throw new Error("No certificate template exists on server for this event.");
      }

      setResponseImg(preview);
      setAlert({
        type: "success",
        message: "Template refreshed from server",
        position: "top-right",
        duration: 2000,
      });
    } catch (error) {
      setAlert({
        type: "error",
        message: error?.message || "Failed to fetch template.",
        position: "top-right",
        duration: 3000,
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async () => {
    if (!eventId) {
      setAlert({
        type: "error",
        message: "Event ID is missing.",
        position: "top-right",
        duration: 4000,
      });
      return;
    }

    const activeTemplate = certificate || responseImg;
    if (!activeTemplate) {
      setAlert({
        type: "warning",
        message: "Please upload a certificate template image first",
        position: "top-right",
        duration: 3000,
      });
      return;
    }

    setSaveLoading(true);
    try {
      const sanitizedFields = fields.map((f) => ({
        ...f,
        x: Number(f.x) || 0,
        y: Number(f.y) || 0,
        fontSize: Number(f.fontSize) || 22,
      }));

      const response = await api.post(
        "/api/certificate/addCertificateTemplate",
        { eventId, template: activeTemplate, fields: sanitizedFields },
        {
          headers: { Authorization: `Bearer ${authCtx.token}` },
        }
      );

      if (response.status !== 200) {
        throw new Error(`API error: ${response.statusText}`);
      }

      setAlert({
        type: "success",
        message: "Certificate template saved successfully!",
        position: "top-right",
        duration: 3000,
      });
    } catch (error) {
      console.error("Error saving certificate template:", error);
      setAlert({
        type: "error",
        message:
          error.response?.data?.message || "Error saving certificate template. Please try again.",
        position: "top-right",
        duration: 3000,
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const currentTemplate = certificate || responseImg;

  return (
    <div className={styles.studioWrapper}>
      {/* Top Header Bar */}
      <div className={styles.topBar}>
        <div className={styles.headingGroup}>
          <h2 className={styles.title}>
            <span>Certificate</span> Studio
          </h2>
          <div className={styles.eventBadge}>
            Event ID: <span className={styles.badgeId}>{eventId}</span>
          </div>
        </div>

        <div className={styles.actionGroup}>
          <button
            type="button"
            className={`${styles.modeToggleBtn} ${isPreviewMode ? styles.activePreview : ""}`}
            onClick={() => setIsPreviewMode((prev) => !prev)}
          >
            {isPreviewMode ? "Edit" : "Preview"}
          </button>
          <Link href={`${SendCertificatePath}/${eventId}`} className={styles.primaryBtn}>
            Send Mails
          </Link>
        </div>
      </div>

      {/* Main Responsive Grid */}
      <div className={styles.workspaceGrid}>
        {/* Left Column: Interactive Canvas */}
        <div className={styles.canvasColumn}>
          <div className={styles.canvasCard}>
            <div
              ref={canvasRef}
              className={styles.interactiveCanvas}
              style={templateAspectRatio ? { aspectRatio: `${templateAspectRatio}` } : {}}
            >
              {loading ? (
                <MicroLoading />
              ) : currentTemplate ? (
                <>
                  <img
                    src={currentTemplate}
                    alt="Certificate Template"
                    className={styles.templateImage}
                    onLoad={(e) => {
                      if (e.target.naturalWidth && e.target.naturalHeight) {
                        setTemplateAspectRatio(e.target.naturalWidth / e.target.naturalHeight);
                      }
                    }}
                  />

                  {/* Render Visual Fields */}
                  {fields.map((field, index) => {
                    const isSelected = selectedFieldIndex === index;
                    const isQr = field.fieldName?.trim().toLowerCase() === "qr";
                    const sampleText =
                      field.fieldName?.toLowerCase() === "date"
                        ? "October 6, 2026"
                        : field.fieldName || "Participant Name";

                    if (isQr) {
                      const baseSize = Number(field.fontSize) || 80;
                      const displaySize = Math.max(
                        28,
                        Math.round(baseSize * (canvasWidth / 800))
                      );

                      if (isPreviewMode) {
                        return (
                          <div
                            key={index}
                            className={styles.previewQrNode}
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
                              fgColor={field.fontColor || "#000000"}
                              bgColor="transparent"
                            />
                          </div>
                        );
                      }

                      return (
                        <div
                          key={index}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingIndex(index);
                            setSelectedFieldIndex(index);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            setDraggingIndex(index);
                            setSelectedFieldIndex(index);
                          }}
                          className={`${styles.fieldNode} ${styles.qrFieldNode} ${draggingIndex === index ? styles.isDragging : ""
                            } ${isSelected ? styles.isSelected : ""}`}
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
                            fgColor={field.fontColor || "#000000"}
                            bgColor="transparent"
                          />
                        </div>
                      );
                    }

                    // Scale font size strictly proportional to the 800px base compositor scale
                    const displayFontSize = Math.max(
                      8,
                      Math.round((Number(field.fontSize) || 22) * (canvasWidth / 800))
                    );

                    if (isPreviewMode) {
                      return (
                        <div
                          key={index}
                          className={styles.previewTextNode}
                          style={{
                            left: `${Number(field.x) || 0}%`,
                            top: `${Number(field.y) || 0}%`,
                            color: field.fontColor || "#000000",
                            fontSize: `${displayFontSize}px`,
                          }}
                        >
                          {sampleText}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={index}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDraggingIndex(index);
                          setSelectedFieldIndex(index);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setDraggingIndex(index);
                          setSelectedFieldIndex(index);
                        }}
                        className={`${styles.fieldNode} ${draggingIndex === index ? styles.isDragging : ""
                          } ${isSelected ? styles.isSelected : ""}`}
                        style={{
                          left: `${Number(field.x) || 0}%`,
                          top: `${Number(field.y) || 0}%`,
                          color: field.fontColor || "#000000",
                          fontSize: `${displayFontSize}px`,
                        }}
                      >
                        <span className={styles.fieldNodeText}>
                          {sampleText}
                        </span>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className={styles.emptyDropzone}>
                  <svg
                    className={styles.uploadIcon}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <h4>No Certificate Template Uploaded</h4>
                  <p>Upload a high-resolution PNG or JPG template to begin arranging fields.</p>
                  <label htmlFor="cert-file-input" className={styles.uploadBtn}>
                    Upload Image
                  </label>
                </div>
              )}
            </div>

            <div className={styles.canvasFooter}>
              <div className={styles.canvasBtnGroup}>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={previewLoading}
                  className={styles.secondaryBtn}
                >
                  {previewLoading ? <MicroLoading /> : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveLoading}
                  className={styles.primaryBtn}
                >
                  {saveLoading ? <MicroLoading /> : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Configuration Sidebar */}
        <div className={styles.controlsSidebar}>
          {/* Template File Uploader */}
          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeader}>
              <h4 className={styles.sectionTitle}>Template Image</h4>
            </div>
            <div className={styles.uploadBox}>
              <input
                id="cert-file-input"
                type="file"
                onChange={handleCertificateChange}
                accept="image/*"
              />
              <span className={styles.fileInfo}>
                Recommended: 1920x1080 or A4 landscape (PNG / JPG)
              </span>
            </div>
          </div>

          {/* Field Details List */}
          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeader}>
              <h4 className={styles.sectionTitle}>Configured Fields ({fields.length})</h4>
              <div className={styles.headerBtnGroup}>
                {fields.length > 1 && (
                  <button
                    type="button"
                    className={styles.collapseToggleBtn}
                    onClick={toggleExpandAll}
                    title={allExpanded ? "Collapse all fields to 1-line chips" : "Expand all fields"}
                  >
                    {allExpanded ? "Collapse All" : "Expand All"}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.newFieldBtn}
                  onClick={() => addNewField()}
                >
                  + New
                </button>
              </div>
            </div>

            {fields.length === 0 ? (
              <div className={styles.emptyFieldsNotice}>
                No fields added yet. Click &quot;+ New&quot; above to place a field on the certificate.
              </div>
            ) : (
              <div className={styles.fieldsList}>
                {fields.map((field, index) => {
                  const isSelected = selectedFieldIndex === index;
                  const isQr = field.fieldName?.toLowerCase() === "qr";
                  const isExpanded = allExpanded
                    ? !field.minimized
                    : isSelected && !field.minimized;

                  return (
                    <div
                      key={index}
                      ref={(el) => (cardRefs.current[index] = el)}
                      onClick={() => {
                        setSelectedFieldIndex(index);
                        if (field.minimized) {
                          handleFieldChange(index, "minimized", false);
                        }
                      }}
                      className={`${styles.fieldCard} ${isSelected ? styles.activeCard : ""} ${!isExpanded ? styles.collapsedCard : ""}`}
                    >
                      <div className={styles.cardHeader}>
                        <div className={styles.cardLabelGroup}>
                          <span
                            className={`${styles.fieldTypeBadge} ${isQr ? styles.qrBadge : ""}`}
                            title={isQr ? "QR Code Element" : "Text Field"}
                          >
                            {isQr ? "QR" : "T"}
                          </span>
                          <span
                            className={styles.cardLabel}
                            title={field.fieldName || `Field ${index + 1}`}
                          >
                            {field.fieldName || `Field ${index + 1}`}
                          </span>
                          <span className={styles.coordsPill}>
                            {Number(field.x) || 0}%, {Number(field.y) || 0}%
                          </span>
                          <span
                            className={styles.colorDot}
                            style={{ backgroundColor: field.fontColor || "#000000" }}
                            title={`Color: ${field.fontColor || "#000000"}`}
                          />
                        </div>

                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleExpand(index);
                            }}
                            title={isExpanded ? "Collapse field" : "Expand field"}
                            aria-label={isExpanded ? "Collapse field" : "Expand field"}
                          >
                            <svg
                              className={`${styles.chevronIcon} ${isExpanded ? styles.expanded : ""}`}
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.deleteBtn}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeField(index);
                            }}
                            title="Delete field"
                            aria-label="Delete field"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div
                          className={styles.cardBody}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className={styles.inputGroup}>
                            <label>Field Name / Variable</label>
                            <input
                              type="text"
                              value={field.fieldName}
                              placeholder="e.g. Participant Name"
                              onChange={(e) =>
                                handleFieldChange(index, "fieldName", e.target.value)
                              }
                            />
                          </div>

                          <div className={styles.rowInputs}>
                            <div className={styles.inputGroup}>
                              <label>X Position (%)</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={field.x ?? ""}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) =>
                                  handleNumericFieldChange(index, "x", e.target.value)
                                }
                                onBlur={() => handleNumericBlur(index, "x", 0, 100, 0)}
                              />
                            </div>
                            <div className={styles.inputGroup}>
                              <label>Y Position (%)</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={field.y ?? ""}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) =>
                                  handleNumericFieldChange(index, "y", e.target.value)
                                }
                                onBlur={() => handleNumericBlur(index, "y", 0, 100, 0)}
                              />
                            </div>
                          </div>

                          <div className={styles.rowInputs}>
                            <div className={styles.inputGroup}>
                              <label>{isQr ? "QR Box Size (px)" : "Font Size (px)"}</label>
                              <div className={styles.stepperWrap}>
                                <input
                                  type="number"
                                  min={isQr ? 30 : 10}
                                  max={isQr ? 250 : 90}
                                  value={field.fontSize ?? ""}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    handleNumericFieldChange(index, "fontSize", e.target.value)
                                  }
                                  onBlur={() =>
                                    handleNumericBlur(
                                      index,
                                      "fontSize",
                                      isQr ? 30 : 10,
                                      isQr ? 250 : 90,
                                      isQr ? 80 : 22
                                    )
                                  }
                                />
                                {isQr && (
                                  <>
                                    <button
                                      type="button"
                                      className={styles.sizeStepperBtn}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleFieldChange(
                                          index,
                                          "fontSize",
                                          Math.max(30, (Number(field.fontSize) || 80) - 10)
                                        );
                                      }}
                                      title="Decrease QR box size"
                                      aria-label="Decrease QR box size"
                                    >
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                      >
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.sizeStepperBtn}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleFieldChange(
                                          index,
                                          "fontSize",
                                          Math.min(250, (Number(field.fontSize) || 80) + 10)
                                        );
                                      }}
                                      title="Increase QR box size"
                                      aria-label="Increase QR box size"
                                    >
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                      >
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className={styles.inputGroup}>
                              <label>{isQr ? "QR Color" : "Font Color"}</label>
                              <div
                                className={styles.colorPickerWrap}
                                onClick={(e) => {
                                  const input = e.currentTarget.querySelector('input[type="color"]');
                                  if (input && e.target !== input) {
                                    input.click();
                                  }
                                }}
                              >
                                <input
                                  type="color"
                                  value={field.fontColor || "#000000"}
                                  onChange={(e) =>
                                    handleFieldChange(index, "fontColor", e.target.value)
                                  }
                                />
                                <span className={styles.colorHex}>
                                  {field.fontColor || "#000000"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificatesForm;
