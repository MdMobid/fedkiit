import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth/access";
import SendCertificate from "@/src/sections/Profile/Admin/Form/CertificatesForm/SendCertificate";

export default async function Page({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(`/Login?next=/profile/events/SendCertificate/${id || ""}`);
  if (!isAdmin(user)) redirect("/profile");

  return <SendCertificate />;
}
