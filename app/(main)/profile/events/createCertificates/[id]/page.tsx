import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth/access";
import CertificatesForm from "@/src/sections/Profile/Admin/Form/CertificatesForm/CertificatesForm";

export default async function Page({ params }: { params: Promise<{ id?: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(`/Login?next=/profile/events/createCertificates/${id || ""}`);
  if (!isAdmin(user)) redirect("/profile");

  return <CertificatesForm />;
}