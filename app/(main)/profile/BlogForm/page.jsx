import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth/access";
import AddBlogForm from "@/src/sections/Profile/Admin/Form/BlogForm/AddBlogForm";

export default async function Page() {
  const user = await getCurrentUser();

  if (!user) redirect("/Login?next=/profile/BlogForm");
  if (!isAdmin(user)) redirect("/profile");

  return <AddBlogForm />;
}
