"use client";

import { usePathname } from "next/navigation";

import Navbar from "@/src/layouts/Navbar/Navbar";
import Footer from "@/src/layouts/Footer/Footer";

/**
 * Main site layout — the `MainLayout` component from App.jsx.
 *
 * Same structure: Navbar, a `.page` wrapper that gains `.omega-page` on the
 * Omega route, then Footer.
 *
 * Deliberately no Suspense boundary here. Wrapping `{children}` made every
 * Prerendered page ship its content twice — once inside the streamed boundary
 * (`div#S:0`) and once outside — so the Home sections appeared duplicated in the
 * DOM. Only the handful of pages that call `useSearchParams()` need a boundary,
 * and they each declare their own.
 */
export default function MainLayout({ children }) {
  const pathname = usePathname();
  const isOmegaPage = pathname?.toLowerCase() === "/omega";

  return (
    <div>
      <Navbar />
      <div className={`page ${isOmegaPage ? "omega-page" : ""}`}>
        {children}
      </div>
      <Footer />
    </div>
  );
}
