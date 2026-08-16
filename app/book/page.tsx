import type { Metadata } from "next";
import BookingForm from "./BookingForm";

export const metadata: Metadata = { title: "Book Your Program" };

// searchParams read server-side and passed as props — keeps the client bundle
// free of useSearchParams/Suspense streaming. ponytail: fewer moving parts.
export default async function BookPage({ searchParams }: { searchParams: Promise<{ slug?: string; tier?: string; canceled?: string }> }) {
  const q = await searchParams;
  return <BookingForm slug={q.slug ?? ""} tierIndex={Number(q.tier ?? "-1")} canceled={q.canceled === "1"} />;
}
