import { redirect } from "next/navigation";
import { canManageBlogs, getCurrentUser } from "@/lib/auth/access";
import AddBlogForm from "@/src/sections/Profile/Admin/Form/BlogForm/AddBlogForm";

export default async function Page() {
  const user = await getCurrentUser();

  if (!user) redirect("/Login?next=/profile/BlogForm");
  // Not isAdmin: the sidebar shows Blogs to SENIOR_EXECUTIVE_CREATIVE too, and
  // the blog API routes allow them, so the page gate has to match.
  if (!canManageBlogs(user)) redirect("/profile");

  return <AddBlogForm />;
}
