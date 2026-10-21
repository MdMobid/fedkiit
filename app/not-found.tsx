import Navbar from "@/app/components/Navbar";
import Footer from "@/src/layouts/Footer/Footer";
import ErrorPage from "@/src/views/Error/Error";

/**
 * 404 — renders the original Error page inside the main chrome, matching the
 * App.jsx catch-all route (`<Route path="*" element={<Error />} />`) which sat
 * inside MainLayout.
 */
export default function NotFound() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Navbar />
      <main
        className="page page--nav-offset"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          padding: "2.5rem 1rem",
        }}
      >
        <ErrorPage />
      </main>
      <Footer />
    </div>
  );
}
