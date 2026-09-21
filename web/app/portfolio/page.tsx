import { redirect } from "next/navigation";

/**
 * §8 called this screen `/portfolio`. It is now `/dashboard`, which is the same
 * page plus a shell — the signed-in surface needs tabs (activity, agents,
 * profile) and a header that does not carry the marketing session clock.
 *
 * Kept as a redirect so the old path does not 404.
 */
export default function PortfolioRedirect() {
  redirect("/dashboard");
}
