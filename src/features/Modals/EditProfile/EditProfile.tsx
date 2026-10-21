"use client";

import { useState, useEffect, useContext } from "react";
import { createPortal } from "react-dom";
import AuthContext from "../../../context/AuthContext";
import styles from "./styles/EditProfile.module.scss";
import { Input } from "../../../components";
import { X } from "lucide-react";
import { Alert, MicroLoading } from "../../../microInteraction";
import { api } from "../../../services";
import { YEAR_OPTIONS } from "../../../data/yearOptions";
import type { AlertProps } from "@/src/microInteraction/Alert/Alert";

const EditProfile = ({ handleModalClose }: { handleModalClose: () => void }) => {
  const authCtx = useContext(AuthContext);
  const [mounted, setMounted] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const [data, setData] = useState({
    name: authCtx.user?.name || "",
    rollNumber: authCtx.user?.rollNumber || "",
    year: authCtx.user?.year || "",
    school: authCtx.user?.school || "",
    college: authCtx.user?.college || "",
    contactNo: authCtx.user?.contactNo || "",
    github: authCtx.user?.extra?.github || "",
    linkedin: authCtx.user?.extra?.linkedin || "",
  });

  useEffect(() => {
    if (alert) {
      const { type, message, position, duration } = alert;
      Alert({ type, message, position, duration });
    }
  }, [alert]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleModalClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleModalClose]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!data.rollNumber?.trim()) newErrors.rollNumber = "Roll Number is required";
    if (!data.school?.trim()) newErrors.school = "School is required";
    if (!data.college?.trim()) newErrors.college = "College is required";
    if (!data.contactNo || !/^\d{10}$/.test(data.contactNo))
      newErrors.contactNo = "Enter a valid 10-digit Mobile Number";
    if (!data.year) newErrors.year = "Year is required";

    const keys = Object.keys(newErrors);

    if (keys.length > 0) {
      setAlert({
        type: "error",
        message: newErrors[keys[0]],
        position: "bottom-right",
        duration: 3000,
      });
      setErrors(newErrors);
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      const { linkedin, github, ...details } = data;
      const modifiedData = {
        ...details,
        extra: {
          github: data.github,
          linkedin: data.linkedin,
        },
      };

      const response = await api.put("/api/user/editDetails", modifiedData, {
        headers: {
          Authorization: `Bearer ${window.localStorage.getItem("token")}`,
        },
      });

      if (response.status === 200 || response.status === 201) {
        setIsLoading(false);
        setErrors({});
        authCtx.update(
          data.name,
          authCtx.user.email,
          authCtx.user.img,
          data.rollNumber,
          data.school,
          data.college,
          data.contactNo,
          data.year,
          data.github,
          data.linkedin,
          authCtx.user.extra?.designation || "",
          authCtx.user.access,
          Number(authCtx.user.editProfileCount) - 1,
          authCtx.user.regForm,
          authCtx.user.blurhash,
          authCtx.user.token
        );
        setTimeout(() => {
          handleModalClose();
        }, 1500);
        setAlert({
          type: "success",
          message: "Profile updated successfully.",
          position: "bottom-right",
          duration: 3000,
        });
      } else {
        setIsLoading(false);
        setAlert({
          type: "error",
          message:
            "There was an error updating your profile. Please try again.",
          position: "bottom-right",
          duration: 3000,
        });
      }
    } catch (error) {
      setIsLoading(false);
      console.error("Error updating profile:", error);
      setAlert({
        type: "error",
        message: "There was an error updating your profile. Please try again.",
        position: "bottom-right",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    margin: "0px",
    height: "44px",
    fontSize: "14px",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "8px",
  };

  if (!mounted) return null;

  return createPortal(
    <div className={styles.modalOverlay} onClick={handleModalClose}>
      <div
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
      >
        <div className={styles.modalHeader}>
          <div className={styles.titleWrapper}>
            <h2 id="edit-profile-title" className={styles.modalTitle}>
              <span>Edit</span> Profile
            </h2>
            <p className={styles.modalSubtitle}>
              Update your personal and academic details
            </p>
          </div>
          <button
            className={styles.closeButton}
            onClick={handleModalClose}
            aria-label="Close edit profile modal"
          >
            <X size={18} />
          </button>
        </div>

        {authCtx.user && (
          <>
            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                {/* Full Name */}
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label htmlFor="edit-name" className={styles.fieldLabel}>
                    Full Name <span className={styles.required}>*</span>
                  </label>
                  <Input
                    id="edit-name"
                    placeholder="Enter your name"
                    type="text"
                    value={data.name}
                    className={styles.modalInput}
                    containerStyle={{ marginTop: 0 }}
                    style={inputStyle}
                    onChange={(e) => setData({ ...data, name: e.target.value })}
                  />
                </div>

                {/* Roll Number */}
                <div className={styles.formGroup}>
                  <label htmlFor="edit-roll" className={styles.fieldLabel}>
                    Roll Number <span className={styles.required}>*</span>
                  </label>
                  <Input
                    id="edit-roll"
                    placeholder="Enter your roll number"
                    type="text"
                    value={data.rollNumber}
                    className={styles.modalInput}
                    containerStyle={{ marginTop: 0 }}
                    style={inputStyle}
                    onChange={(e) =>
                      setData({ ...data, rollNumber: e.target.value })
                    }
                  />
                </div>

                {/* Year */}
                <div className={styles.formGroup}>
                  <label htmlFor="edit-year" className={styles.fieldLabel}>
                    Year <span className={styles.required}>*</span>
                  </label>
                  <Input
                    id="edit-year"
                    type="select"
                    name="year"
                    options={YEAR_OPTIONS}
                    value={data.year}
                    containerStyle={{ marginTop: 0 }}
                    style={inputStyle}
                    onChange={(value) => setData({ ...data, year: value })}
                  />
                </div>

                {/* School */}
                <div className={styles.formGroup}>
                  <label htmlFor="edit-school" className={styles.fieldLabel}>
                    School <span className={styles.required}>*</span>
                  </label>
                  <Input
                    id="edit-school"
                    placeholder="Enter your school (e.g. CSE)"
                    type="text"
                    value={data.school}
                    className={styles.modalInput}
                    containerStyle={{ marginTop: 0 }}
                    style={inputStyle}
                    onChange={(e) => setData({ ...data, school: e.target.value })}
                  />
                </div>

                {/* College */}
                <div className={styles.formGroup}>
                  <label htmlFor="edit-college" className={styles.fieldLabel}>
                    College <span className={styles.required}>*</span>
                  </label>
                  <Input
                    id="edit-college"
                    placeholder="Enter your college"
                    type="text"
                    value={data.college}
                    className={styles.modalInput}
                    containerStyle={{ marginTop: 0 }}
                    style={inputStyle}
                    onChange={(e) => setData({ ...data, college: e.target.value })}
                  />
                </div>

                {/* Mobile No */}
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label htmlFor="edit-contact" className={styles.fieldLabel}>
                    Mobile Number <span className={styles.required}>*</span>
                  </label>
                  <Input
                    id="edit-contact"
                    placeholder="Enter 10-digit mobile number"
                    type="tel"
                    maxLength={10}
                    value={data.contactNo}
                    className={styles.modalInput}
                    containerStyle={{ marginTop: 0 }}
                    style={inputStyle}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/^\d*$/.test(value) && value.length <= 10) {
                        setData({ ...data, contactNo: value });
                      }
                    }}
                    error={errors.contactNo}
                  />
                </div>

                {/* Social links for non-standard USERs (Admin / Lead) */}
                {authCtx.user.access !== "USER" && (
                  <>
                    <div className={styles.formGroup}>
                      <label htmlFor="edit-github" className={styles.fieldLabel}>
                        GitHub Profile
                      </label>
                      <Input
                        id="edit-github"
                        placeholder="https://github.com/username"
                        type="text"
                        value={data.github}
                        className={styles.modalInput}
                        containerStyle={{ marginTop: 0 }}
                        style={inputStyle}
                        onChange={(e) =>
                          setData({ ...data, github: e.target.value })
                        }
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="edit-linkedin" className={styles.fieldLabel}>
                        LinkedIn Profile
                      </label>
                      <Input
                        id="edit-linkedin"
                        placeholder="https://linkedin.com/in/username"
                        type="text"
                        value={data.linkedin}
                        className={styles.modalInput}
                        containerStyle={{ marginTop: 0 }}
                        style={inputStyle}
                        onChange={(e) =>
                          setData({ ...data, linkedin: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className={styles.modalFooter}>
              {authCtx.user.access === "USER" && (
                <p className={styles.editNotice}>
                  You can edit your profile up to <span>5 times</span>.
                  Remaining: <span>{authCtx.user.editProfileCount}</span>
                </p>
              )}
              <button
                type="button"
                onClick={handleSave}
                className={styles.submitBtn}
                disabled={isLoading}
              >
                {isLoading ? <MicroLoading /> : "Update Changes"}
              </button>
            </div>
          </>
        )}
      </div>
      <Alert />
    </div>,
    document.body
  );
};

export default EditProfile;
