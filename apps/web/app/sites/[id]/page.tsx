import { Suspense } from "react";
import SiteBrowserPage from "@/features/sites/screens/SiteBrowserPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // useSearchParams (the selected page lives in the URL) needs a Suspense
  // boundary to keep this route statically renderable.
  return (
    <Suspense fallback={null}>
      <SiteBrowserPage id={Number(id)} />
    </Suspense>
  );
}
