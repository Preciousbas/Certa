"use client";

import { ErrorState } from "../components/error-state";

export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
