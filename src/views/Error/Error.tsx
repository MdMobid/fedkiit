"use client";

import { useEffect } from "react";
import errorImage from "../../assets/images/errorPage.jpg";
import styles from "./styles/Error.module.scss";
import { useRouter } from "next/navigation";

function Error() {
  const router = useRouter();

  // Ran during render in the Vite app, which only ever executed in a browser.
  // Under Next.js this also runs on the server, where `window` is undefined.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleReturnToHome = () => {
    router.push("/");
  };

  return (
    <div className={styles.errorContainer}>
      <div className={styles.box}>
        <img src={errorImage.src} alt="Error Page" />
        <p>
          The webpage you are looking for is currently under maintenance or does
          not exist. Please try again later. If the problem continues, mail us at{" "}
          <a href="mailto:fedkiit@gmail.com" className={styles.emailLink}>
            fedkiit@gmail.com
          </a>
          .
        </p>
        <button onClick={handleReturnToHome} className={styles.returnButton}>
          Return To Home
        </button>
      </div>
    </div>
  );
}

export default Error;
