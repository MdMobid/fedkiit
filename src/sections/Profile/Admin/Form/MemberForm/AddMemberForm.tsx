"use client";

import React, { useState, useEffect, useContext, useRef } from "react";
import axios from "axios";
import styles from "./styles/AddMemberForm.module.scss";
import { Input } from "../../../../../components";
import AuthContext from "../../../../../context/AuthContext";
import { api } from "../../../../../services";
import { EditImage } from "../../../../../features";
import {
  ComponentLoading,
  MicroLoading,
  Alert,
} from "../../../../../microInteraction";
import type { ApiError } from "@/src/types/api";
import type { MemberExtra } from "@/src/types/member";

type MemberDraft = {
  name: string;
  email: string;
  access: string;
  /**
   * The chosen photo's file name. Typing in the image field stores the
   * cropped File itself (or null), which the field then shows as text.
   */
  img: string | File | null;
  linkedin: string;
  github: string;
  designation: string;
  know: string;
};

type AddMemberFormProps = {
  onSuccess?: () => void;
  onCancel?: () => void;
};

function AddMemberForm({ onSuccess, onCancel }: AddMemberFormProps) {
  const authCtx = useContext(AuthContext);
  const [data, setData] = useState<MemberDraft>({
    name: "",
    email: "",
    access: "",
    img: "",
    linkedin: "",
    github: "",
    designation: "",
    know: "",
  });
  const [selectedFileName, setFileName] = useState<string | null>(null);
  const [croppedImageFile, setCroppedFile] = useState<File | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePrv, setImagePrv] = useState<string | null>(null);
  const [isloading, setIsLoading] = useState(false);
  const [isMicroLoading, setIsMicroLoading] = useState(false);
  const [accessTypes, setAccessTypes] = useState<string[]>([]);
  const imgRef = useRef<HTMLInputElement>(null);
  const [openModal, setOpenModal] = useState(false);

  useEffect(() => {
    if (authCtx.memberData) {
      // Older rows keep `extra` as JSON text; reading a link off a string gives
      // undefined, so those fall back to "" just as before.
      const extra = authCtx.memberData.extra as MemberExtra | null | undefined;
      setData({
        name: authCtx.memberData.name || "",
        email: authCtx.memberData.email || "",
        access: authCtx.memberData.access || "",
        img: authCtx.memberData.img || "",
        linkedin: extra?.linkedin || "",
        github: extra?.github || "",
        designation: extra?.designation || "",
        know: extra?.know || "",
      });
      if (authCtx.memberData.img) {
        setImagePrv(authCtx.memberData.img);
      }
    }
  }, [authCtx.memberData]);

  useEffect(() => {
    if (authCtx.croppedImageFile) {
      const file = authCtx.croppedImageFile;
      setCroppedFile(authCtx.croppedImageFile);
      setData((prev) => ({ ...prev, img: file.name }));
    }
  }, [authCtx.croppedImageFile]);

  useEffect(() => {
    fetchAccessTypes();
  }, []);

  const fetchAccessTypes = async () => {
    try {
      const response = await api.get("/api/user/fetchAccessTypes");
      const fetchedAccessTypes = response.data.data;
      setAccessTypes(Array.isArray(fetchedAccessTypes) ? fetchedAccessTypes : []);
    } catch (error) {
      console.error("Error fetching access types:", error);
      setAccessTypes([]);
    }
  };

  const isFormFilled = () => {
    const { email, access } = data;
    return Boolean(email && email.trim() !== "" && access && access.trim() !== "");
  };

  const filterData = (data: MemberDraft) => {
    const filteredData: Record<string, string> = {};
    const extra: MemberExtra = {};

    if (data.designation && typeof data.designation === "string" && data.designation.trim() !== "") {
      extra.designation = data.designation.trim();
    }
    if (data.github && typeof data.github === "string" && data.github.trim() !== "") {
      extra.github = data.github.trim();
    }
    if (data.linkedin && typeof data.linkedin === "string" && data.linkedin.trim() !== "") {
      extra.linkedin = data.linkedin.trim();
    }
    if (data.know && typeof data.know === "string" && data.know.trim() !== "") {
      extra.know = data.know.trim();
    }

    if (Object.keys(extra).length > 0) {
      filteredData.extra = JSON.stringify(extra);
    }

    (Object.keys(data) as (keyof MemberDraft)[]).forEach((key) => {
      const value = data[key];
      if (
        key !== "designation" &&
        key !== "github" &&
        key !== "linkedin" &&
        key !== "know" &&
        typeof value === "string" &&
        value.trim() !== ""
      ) {
        filteredData[key] = value.trim();
      }
    });

    return filteredData;
  };

  const onAddOrUpdateMember = async () => {
    setIsMicroLoading(true);
    if (isFormFilled()) {
      const isUpdating = Boolean(authCtx.memberData);
      try {
        const filteredData = filterData(data);
        const formData = new FormData();

        for (const key in filteredData) {
          if (key !== "img") {
            formData.append(key, filteredData[key]);
          }
        }

        if (croppedImageFile) {
          formData.append("image", croppedImageFile);
        }

        const headers: Record<string, string> = {};
        const token = window.localStorage.getItem("token");
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await api.post("/api/user/addMember", formData, {
          headers,
        });

        setData({
          name: "",
          email: "",
          access: "",
          img: "",
          linkedin: "",
          github: "",
          designation: "",
          know: "",
        });
        setImagePrv(null);
        setCroppedFile(null);
        setSelectedFile(null);
        setFileName(null);
        if (authCtx.memberData) {
          authCtx.memberData = null;
        }
        if (authCtx.croppedImageFile) {
          authCtx.croppedImageFile = null;
        }

        const message =
          response.data?.message ||
          (isUpdating ? "Member Updated Successfully" : "Member Added Successfully");
        Alert({
          type: "success",
          message,
          position: "bottom-right",
          duration: 3000,
        });
        if (onSuccess) {
          onSuccess();
        }
      } catch (error) {
        console.error("Error adding/updating member:", error);
        const errorMsg =
          (error as ApiError)?.response?.data?.message ||
          "Failed to save member. Please try again.";
        Alert({
          type: "error",
          message: errorMsg,
          position: "bottom-right",
          duration: 4000,
        });
      } finally {
        setIsMicroLoading(false);
      }
    } else {
      Alert({
        type: "error",
        message: "Please fill all the required fields (Email and Access)",
        position: "bottom-right",
        duration: 4000,
      });
    }
  };

  const isSafeImagePreviewUrl = (url: unknown): url is string => {
    return (
      typeof url === "string" &&
      (url.startsWith("blob:") ||
        url.startsWith("data:image/") ||
        url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.startsWith("/"))
    );
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files![0];
    if (file) {
      if (!file.type || !file.type.startsWith("image/")) {
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isSafeImagePreviewUrl(reader.result)) {
          setImagePrv(reader.result);
        } else {
          setImagePrv(null);
        }
      };
      reader.readAsDataURL(file);
      setSelectedFile(file);
      // console.log("File in addmember comp:", croppedImageFile);
      setData({ ...data, img: file.name });
      setFileName(file.name);
      setOpenModal(true);
    }
  };

  const closeModal = () => {
    setSelectedFile(null);
    setOpenModal(false);
  };

  const updateImagePreview = (url: string) => {
    if (isSafeImagePreviewUrl(url)) {
      setImagePrv(url);
    } else {
      setImagePrv(null);
    }
    // selectedFile(imageFile);
  };

  return (
    <div className={styles.main}>
      <div className={styles.formHead}>
        <Input
          placeholder="Name"
          type="text"
          label="Enter Member Name"
          className={styles.memberInput}
          containerStyle={{ width: "100%" }}
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
        />
        <Input
          placeholder="Enter Member Email"
          type="text"
          label="Email"
          className={styles.memberInput}
          containerStyle={{ width: "100%" }}
          value={data.email}
          onChange={(e) => setData({ ...data, email: e.target.value })}
        />
      </div>
      <div className={styles.formHead}>
        <Input
          placeholder="Select Access"
          type="select"
          label="Access"
          options={accessTypes.map((type) => ({ value: type, label: type }))}
          className={styles.memberInput}
          containerStyle={{ width: "100%" }}
          value={data.access}
          onChange={(value) => setData({ ...data, access: value })}
        />
        <div className={styles.imageInputContainer}>
          {selectedFile && (
            <EditImage
              selectedFile={selectedFile}
              setFile={setCroppedFile}
              closeModal={closeModal}
              setimgprv={updateImagePreview} // Pass the updated function
              fileName={selectedFileName}
            // setImgFile={setCroppedFile}
            />
          )}

          {imagePrv && (
            <div className={styles.imagePreview}>
              <img src={imagePrv} alt="Preview" />
            </div>
          )}
          <Input
            placeholder="Enter Member Image File"
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              imgRef.current?.click();
            }}
            type="text"
            label="Image"
            className={styles.memberInput}
            containerStyle={{ width: imagePrv ? "90%" : "100%" }}
            value={data.img as string | null}
            onChange={() => setData({ ...data, img: croppedImageFile })}
          />
          <input
            style={{ display: "none" }}
            type="file"
            ref={imgRef}
            onChange={handleFileChange}
          />
        </div>
      </div>
      <div className={styles.formHead}>
        <Input
          placeholder="Enter Member LinkedIn Link"
          type="text"
          label="LinkedIn"
          className={styles.memberInput}
          value={data.linkedin}
          onChange={(e) => setData({ ...data, linkedin: e.target.value })}
          containerStyle={{ width: "100%" }}
        />
        <Input
          placeholder="Enter Member Github Link"
          type="text"
          label="Github"
          value={data.github}
          onChange={(e) => setData({ ...data, github: e.target.value })}
          className={styles.memberInput}
          containerStyle={{ width: "100%" }}
        />
      </div>
      <div className={styles.formHead}>
        <Input
          placeholder="Enter Designation"
          type="text"
          label="Designation"
          value={data.designation}
          onChange={(e) => setData({ ...data, designation: e.target.value })}
          className={styles.memberInput}
          containerStyle={{ width: "100%" }}
        />
        <Input
          placeholder="Enter Know"
          type="text"
          label="Know"
          value={data.know}
          onChange={(e) => setData({ ...data, know: e.target.value })}
          className={styles.memberInput}
          containerStyle={{ width: "100%" }}
        />
      </div>
      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.submitButton}
          onClick={onAddOrUpdateMember}
          disabled={isMicroLoading}
        >
          {isMicroLoading ? (
            <MicroLoading />
          ) : authCtx.memberData ? (
            "Update Member"
          ) : (
            "Add Member"
          )}
        </button>
        {onCancel && (
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isMicroLoading}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default AddMemberForm;
