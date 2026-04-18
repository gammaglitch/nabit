import ReaderPage from "@/features/reader/screens/ReaderPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReaderPage id={Number(id)} />;
}
