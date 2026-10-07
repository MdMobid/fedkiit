import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth/access";
import ViewMember from "@/src/sections/Profile/Admin/View/ViewMember/ViewMember";

export default async function Page() {
  const user = await getCurrentUser();

  if (!user) redirect("/Login?next=/profile/members");
  if (!isAdmin(user)) redirect("/profile");

  return <ViewMember />;
}
