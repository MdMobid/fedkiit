"use client";

/* eslint-disable no-unused-vars */
/* eslint-disable no-dupe-keys */
/* eslint-disable react/no-unescaped-entities */
import { useContext, useState } from "react";
import styles from "./style/Signup.module.scss";
import { Input, Button, Text } from "../../components";
import GoogleSignup from "./GoogleSignup";
import { isGoogleOAuthEnabled } from "../../utils/googleOAuth";
import bcrypt from "bcryptjs";
import { useEffect } from "react";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import OtpInputModal from "../../features/Modals/authentication/OtpInputModal";
import { Alert, MicroLoading } from "../../microInteraction";
import { RecoveryContext } from "../../context/RecoveryContext";
import { api } from "../../services";
import AuthContext, { SESSION_TTL_MS } from "../../context/AuthContext";
import Link from "next/link";
import { useRouter } from "next/navigation";
import postAuthRedirect from "../../utils/postAuthRedirect";
import { YEAR_OPTIONS } from "../../data/yearOptions";
import type { AlertProps } from "@/src/microInteraction/Alert/Alert";
import type { ApiError } from "@/src/types/api";
// import { validateData } from "../../utils/hooks/validation/validateSignupData";

/** The account details sent to /api/auth/register once the OTP is entered. */
type NewAccount = {
  name: string;
  email: string;
  password: string;
  rollNumber: string;
  school: string;
  college: string;
  contactNo: string;
  year: string;
};

const SignUp = () => {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [userObject, setUserObject] = useState<NewAccount | Record<string, never>>({});
  const { setEmail } = useContext(RecoveryContext);
  const [OTP, setOTP] = useState("");
  const [isTandChecked, setTandC] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [shouldNavigate, setShouldNavigate] = useState(false);
  const [navigatePath, setNavigatePath] = useState("/");
  const [showDropdown, setShowDropdown] = useState(false);
  const authCtx = useContext(AuthContext);

  const [showUser, setUser] = useState({
    email: "",
    Password: "",
    FirstName: "",
    LastName: "",
    rollNumber: "",
    school: "",
    college: "",
    year: "",
    contactNo: "+91",
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (alert) {
      const { type, message, position, duration } = alert;
      Alert({ type, message, position, duration });
      setAlert(null); // Reset alert after displaying it
    }
  }, [alert]);

  useEffect(() => {
    if (shouldNavigate) {
      router.push(navigatePath);
      setShouldNavigate(false); // Reset state after navigation
    }
  }, [shouldNavigate, navigatePath, router]);

  // Keyed by each input's `name`, which matches a field of showUser.
  const DataInp = (name: string, value: string) => {
    if (name === "college" && value.toLowerCase().startsWith("k")) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
    setUser({ ...showUser, [name]: value });
  };

  const handleSelectCollege = () => {
    setUser({
      ...showUser,
      college: "Kalinga Institute of Industrial Technology",
    });
    setShowDropdown(false);
  };

  const validateData = (data: typeof showUser, isTandChecked: boolean) => {
    const errors: string[] = [];

    if (!data.FirstName) {
      errors.push("First Name is required.");
    }

    if (!data.LastName) {
      errors.push("Last Name is required.");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      errors.push("Enter a valid email address.");
    }

    if (data.contactNo.length < 10 || data.contactNo.length > 12) {
      errors.push("Contact Number must be between 10 and 12 digits.");
    }

    if (!data.college) {
      errors.push("College is required.");
    }

    if (!data.school) {
      errors.push("School is required.");
    }

    if (!data.rollNumber) {
      errors.push("Roll Number is required.");
    }

    if (!data.year) {
      errors.push("Year is required.");
    }

    if (!data.Password) {
      errors.push("Password is required.");
    }

    if (!isTandChecked) {
      errors.push("Please check the terms and conditions.");
    }

    return errors;
  };

  const handleSignUp = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const validationResult = validateData(showUser, isTandChecked);

    if (validationResult.length > 0) {
      setAlert({
        type: "error",
        message: validationResult.join(" "),
        position: "bottom-right",
        duration: 3000,
      });
      setIsLoading(false);
      return;
    }

    const {
      email,
      Password,
      FirstName,
      LastName,
      rollNumber,
      school,
      college,
      contactNo,
      year,
    } = showUser;

    const name = FirstName + " " + LastName;
    const saltRounds = parseInt(String(process.env.NEXT_PUBLIC_BCRYPT), 10);
    const password = bcrypt.hashSync(Password, saltRounds);
    const user: NewAccount = {
      name,
      email,
      password,
      rollNumber,
      school,
      college,
      contactNo,
      year,
    };

    setUserObject(user);

    try {

      setAlert({
        type: "info",
        message: "Verifying Email...",
        position: "bottom-right",
        duration: 3000,
      });
      setEmail(user.email);
      const response = await api.post(
        "/api/auth/verifyEmail",
        { email: user.email },
        { headers: { "Content-Type": "application/json" } }
      );

      if (response.status === 200 || response.status === 201) {

        setTimeout(() => {
          setShowModal(true);
        }, 3000);

        setAlert({
          type: "success",
          message: response.data.message || "Otp Sent to Email",
          position: "bottom-right",
          duration: 3000,
        });
      } else {
        setAlert({
          type: "error",
          message: response.data.message || "Error in sending OTP",
          position: "bottom-right",
          duration: 3000,
        });
      }
    } catch (error) {
      setAlert({
        type: "error",
        message:
          (error as ApiError)?.response?.data?.message ||
          "Failed to send OTP. Please try again.",
        position: "bottom-right",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (enteredOTP: string) => {
    if (enteredOTP) {
      try {
        const response = await api.post("/api/auth/register", {
          ...userObject,
          otp: enteredOTP,
        });

        if (response.status == 200 || response.status == 201) {
          // setLoad(false);
          localStorage.setItem("token", response.data.token);
          // console.log(response);
          authCtx.login(
            response.data.user.name,
            response.data.user.email,
            response.data.user.img,
            response.data.user.rollNumber,
            response.data.user.school,
            response.data.user.college,
            response.data.user.contactNo,
            response.data.user.year,
            response.data.user.extra?.github,
            response.data.user.extra?.linkedin,
            response.data.user.extra?.designation,
            response.data.user.access,
            response.data.user.editProfileCount,
            response.data.user.regForm,
            response.data.user.blurhash,
            response.data.token,
            SESSION_TTL_MS
          );
          // console.log(authCtx);
          // Return to whatever sent them here — a team invite link, typically —
          // instead of always landing on the home page. Falls back to "/" when
          // nothing is pending, which is where the original always went.
          router.push(postAuthRedirect("/"));
        }
      } catch (error) {
        setAlert({
          type: "error",
          message: (error as ApiError)?.response?.data?.message || "Enter valid Details",
          position: "bottom-right",
          duration: 3000,
        });
      }

      // Handle successful verification
    } else {
      setAlert({
        type: "error",
        message: "Validation Failed! Enter Valid OTP",
        position: "bottom-right",
        duration: 3000,
      });
      // console.log("Enter valid Otp");
    }
  };
  const handleModalClose = () => {
    setShowModal(false);
  };

  const handleCheckBox = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTandC(e.target.checked);
  };

  // console.log(alert)

  return (
    <div className={styles.page}>
      <Link href={"/"}>
        <div className={styles.ArrowBackIcon}>
          <ArrowBackIcon />
        </div>
      </Link>
      <div className={styles.circle}>
        <div></div>
      </div>
      <div className={styles.circle1}></div>

      <div className={styles.container}>
        <div className={styles.signin}>
          <h1
            style={{
              paddingTop: "10px",
              background: "var(--primary)",
              width: "max-content",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            Sign Up
          </h1>

          <GoogleSignup setAlert={setAlert} />

          {isGoogleOAuthEnabled() ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "1rem",
                marginTop: "10px",
                marginBottom: "4px",
              }}
            >
              <div className={styles.divider} />
              <p
                style={{
                  color: "#fff",
                  textAlign: "center",
                  marginBottom: "0.2rem",
                }}
              >
                or
              </p>
              <div className={styles.divider} />
            </div>
          ) : null}

          <form onSubmit={handleSignUp}>
            <div className={styles.formGrid}>
              {/* First Name */}
              <div>
                <Input
                  type="text"
                  placeholder="First Name"
                  label="First Name"
                  name="FirstName"
                  value={showUser.FirstName}
                  onChange={(e) => DataInp(e.target.name, e.target.value)}
                  required
                  containerStyle={{ marginTop: "4px" }}
                  style={{ width: "100%", margin: "0px" }}
                />
              </div>

              {/* Last Name */}
              <div>
                <Input
                  type="text"
                  placeholder="Last Name"
                  label="Last Name"
                  name="LastName"
                  value={showUser.LastName}
                  onChange={(e) => DataInp(e.target.name, e.target.value)}
                  required
                  containerStyle={{ marginTop: "4px" }}
                  style={{ width: "100%", margin: "0px" }}
                />
              </div>

              {/* Email */}
              <div>
                <Input
                  type="email"
                  placeholder="eg.-myemail@gmail.com"
                  label="Email"
                  name="email"
                  value={showUser.email}
                  onChange={(e) => DataInp(e.target.name, e.target.value)}
                  required
                  containerStyle={{ marginTop: "4px" }}
                  style={{ width: "100%", margin: "0px" }}
                />
              </div>

              {/* Mobile */}
              <div>
                <Input
                  type="number"
                  placeholder="1234567890"
                  label="Mobile"
                  name="contactNo"
                  value={showUser.contactNo}
                  onChange={(e) => DataInp(e.target.name, e.target.value)}
                  required
                  containerStyle={{ marginTop: "4px" }}
                  style={{ width: "100%", margin: "0px" }}
                />
              </div>

              {/* College */}
              <div className={styles.collegeWrapper}>
                <Input
                  type="text"
                  placeholder="College Name"
                  label="College"
                  name="college"
                  value={showUser.college}
                  onChange={(e) => DataInp(e.target.name, e.target.value)}
                  required
                  containerStyle={{ marginTop: "4px" }}
                  style={{ width: "100%", margin: "0px" }}
                />
                {showDropdown && (
                  <div className={styles.dropdown}>
                    <div
                      className={styles.dropdownItem}
                      onClick={handleSelectCollege}
                    >
                      Kalinga Institute of Industrial Technology
                    </div>
                  </div>
                )}
              </div>

              {/* School */}
              <div>
                <Input
                  type="text"
                  placeholder="School (e.g. CSE)"
                  label="School"
                  name="school"
                  value={showUser.school}
                  onChange={(e) => DataInp(e.target.name, e.target.value)}
                  required
                  containerStyle={{ marginTop: "4px" }}
                  style={{ width: "100%", margin: "0px" }}
                />
              </div>

              {/* Year */}
              <div>
                <Input
                  type="select"
                  placeholder="Select year"
                  label="Year"
                  name="year"
                  options={YEAR_OPTIONS}
                  value={showUser.year}
                  onChange={(value) => DataInp("year", value)}
                  required
                  containerStyle={{ marginTop: "4px" }}
                  style={{ width: "100%", margin: "0px" }}
                />
              </div>

              {/* Roll Number */}
              <div>
                <Input
                  type="text"
                  placeholder="Roll Number"
                  label="Roll Number"
                  name="rollNumber"
                  value={showUser.rollNumber}
                  onChange={(e) => DataInp(e.target.name, e.target.value)}
                  required
                  containerStyle={{ marginTop: "4px" }}
                  style={{ width: "100%", margin: "0px" }}
                />
              </div>

              {/* Password */}
              <div className={styles.fullWidth}>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  label="Password"
                  name="Password"
                  value={showUser.Password}
                  onChange={(e) => DataInp(e.target.name, e.target.value)}
                  required
                  containerStyle={{ marginTop: "4px" }}
                  style={{ width: "100%", margin: "0px" }}
                />
              </div>

              {/* Terms and conditions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginTop: "10px",
                  marginLeft: "4px",
                  gridColumn: "1 / -1",
                }}
              >
                <input
                  type="checkbox"
                  style={{
                    height: "16px",
                    width: "16px",
                    cursor: "pointer",
                    accentColor: "#ff8a00",
                  }}
                  checked={isTandChecked}
                  onChange={handleCheckBox}
                  id="custom-checkbox"
                />

                <Text
                  style={{
                    fontSize: "0.774rem",
                    marginLeft: "8px",
                  }}
                >
                  Agree to FED's{" "}
                  <Link
                    href="/TermsAndConditions"
                    style={{
                      background: "var(--primary)",
                      WebkitBackgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    Terms and Conditions
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/PrivacyPolicy"
                    style={{
                      background: "var(--primary)",
                      WebkitBackgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    Privacy Policy
                  </Link>.
                </Text>
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                style={{
                  width: "100%",
                  background: "var(--primary)",
                  color: "#fff",
                  height: "40px",
                  marginTop: "16px",
                  fontSize: "1rem",
                  cursor: "pointer",
                  gridColumn: "1 / -1",
                }}
                disabled={isLoading}
              >
                {isLoading ? <MicroLoading /> : "Sign Up"}
              </Button>

              {/* Login link */}
              <Text
                style={{
                  fontSize: "0.8rem",
                  textAlign: "center",
                  marginTop: "14px",
                  gridColumn: "1 / -1",
                }}
              >
                Already have an account?{" "}
                <Link
                  href="/Login"
                  style={{
                    background: "var(--primary)",
                    WebkitBackgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  Login
                </Link>
              </Text>
            </div>
          </form>
        </div>
      </div>

      {showModal && (
        <OtpInputModal
          onVerify={handleVerifyOTP}
          handleClose={handleModalClose}
        />
      )}
      <Alert />
    </div>
  );
};

export default SignUp;
