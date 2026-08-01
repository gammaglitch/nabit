import { notFound } from "next/navigation";
import DebugSyncPage from "@/features/debug/screens/DebugSyncPage";

// Dev-only tool for trialing the API's /export endpoints. Hidden in production.
export default function Page() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <DebugSyncPage />;
}
