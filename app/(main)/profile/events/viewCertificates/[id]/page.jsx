import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth/access";
import ViewCertificates from "@/src/sections/Profile/Admin/View/ViewCertificates/ViewCertificates";

export default async function Page({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(`/Login?next=/profile/events/viewCertificates/${id || ""}`);
  if (!isAdmin(user)) redirect("/profile");

  return <ViewCertificates eventId={id} />;
}
