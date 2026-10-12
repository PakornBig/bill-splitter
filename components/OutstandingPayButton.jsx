"use client";

import { useTransition } from "react";
import { markSharesPaid } from "@/app/(app)/bills/actions";

export default function OutstandingPayButton({ shareIds, label }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn-secondary !px-2 !py-1 text-xs"
      disabled={pending}
      onClick={() => startTransition(() => markSharesPaid(shareIds))}
    >
      {pending ? "..." : `✓ ${label}`}
    </button>
  );
}
