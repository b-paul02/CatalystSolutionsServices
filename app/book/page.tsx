import type { Metadata } from "next";
import { Suspense } from "react";
import BookingForm from "./BookingForm";

export const metadata: Metadata = { title: "Book Your Program" };

export default function BookPage() {
  return (
    <Suspense>
      <BookingForm />
    </Suspense>
  );
}
