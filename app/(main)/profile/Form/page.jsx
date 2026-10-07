import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth/access";
import NewForm from "@/src/sections/Profile/Admin/Form/NewForm/NewForm";

export default async function Page() {
  const user = await getCurrentUser();

  if (!user) redirect("/Login?next=/profile/Form");
  if (!isAdmin(user)) redirect("/profile");

  return <NewForm />;
}
