"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, ShieldAlert } from "lucide-react";

import { api } from "../../../../../services";
import { ComponentLoading } from "../../../../../microInteraction";
import styles from "./styles/VerifyCertificate.module.scss";
import type { ApiError } from "@/src/types/api";

type VerifiedCertificate = {
  imageSrc: string;
  certificateId: string;
  name: string;
  email: string;
  event: string;
};

const VerifyCertificate = () => {
  const searchParams = useSearchParams();
  const certificateId = searchParams.get("id");

  const [certificateData, setCertificateData] =
    useState<VerifiedCertificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchCertificate = async () => {
      if (!certificateId) {
        setError("No certificate ID provided.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setCertificateData(null);

      try {
        const response = await api.post(
          "/api/certificate/verifyCertificate",
          { id: certificateId }
        );

        if (cancelled) return;

        const data = response.data;
        const certificate = data?.certificate;

        if (!data?.imageSrc || !certificate) {
          setError("Invalid certificate data.");
          return;
        }

        setCertificateData({
          imageSrc: data.imageSrc,
          certificateId: certificate.certificateId || certificateId,
          name:
            certificate.fieldValues?.name ||
            certificate.fieldValues?.Name ||
            certificate.fieldValues?.recipient_name ||
            "N/A",
          email: certificate.email || "N/A",
          event: data.event?.name || "N/A",
        });
      } catch (err) {
        if (cancelled) return;

        setError(
          (err as ApiError)?.response?.data?.message ||
          "Certificate not found or has been revoked."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchCertificate();

    return () => {
      cancelled = true;
    };
  }, [certificateId]);

  const handleDownload = () => {
    if (!certificateData?.imageSrc) return;

    const link = document.createElement("a");
    link.href = certificateData.imageSrc;
    link.download = `Certificate_${certificateData.certificateId}.png`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyLink = async () => {
    const url = currentUrl || window.location.href;

    // A failed copy (no clipboard access, or an insecure context) only changes
    // the button: going through setError would swap the verified certificate
    // for the "Invalid Certificate ID" screen.
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <ComponentLoading />
        <p>Verifying certificate...</p>
      </div>
    );
  }

  if (error || !certificateData) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>
          Certificate <span>Verification</span>
        </h1>

        <div className={styles.errorContainer}>
          <div className={styles.errorIcon}>
            <ShieldAlert size={30} />
          </div>
          <h3>Invalid Certificate ID</h3>
          <p>{error || "Certificate data could not be loaded."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>
        Certificate <span>Verification</span>
      </h1>

      <div className={styles.contentWrapper}>
        <div className={styles.imageContainer}>
          <img
            src={certificateData.imageSrc}
            alt="Verified Certificate"
          />
        </div>

        <div className={styles.detailsContainer}>
          <table className={styles.detailsTable}>
            <tbody>
              <tr>
                <th>Certificate ID:</th>
                <td>{certificateData.certificateId}</td>
              </tr>

              <tr>
                <th>Name:</th>
                <td>{certificateData.name}</td>
              </tr>

              <tr>
                <th>Event:</th>
                <td>{certificateData.event}</td>
              </tr>

              <tr>
                <th>Email:</th>
                <td>{certificateData.email}</td>
              </tr>

              {/*
                No "Event Date" row: the only date the verify API returns is
                when the certificate's event was created in the studio, not
                when the event took place.
              */}
            </tbody>
          </table>

          <div className={styles.bottomRow}>
            <div className={styles.actionButtons}>
              <div className={styles.verifiedTag}>
                <CheckCircle />
                <span style={{ color: "white" }}>
                  Verified by FEDKIIT
                </span>
              </div>

              <div className={styles.buttonGroup}>
                <button
                  className={styles.downloadBtn}
                  onClick={handleDownload}
                >
                  Download
                </button>

                <button
                  className={styles.downloadBtn}
                  onClick={copyLink}
                >
                  {copyState === "copied"
                    ? "Copied..."
                    : copyState === "failed"
                      ? "Copy failed"
                      : "Copy Link"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyCertificate;
