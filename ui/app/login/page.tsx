"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/** Legacy /login URLs → unified AWS connect flow */
function LoginRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const q = params.toString();
    router.replace(q ? `/connect?${q}` : "/connect");
  }, [router, params]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="font-mono text-sm text-[#2d4038] animate-pulse">Redirecting…</p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <LoginRedirect />
    </Suspense>
  );
}
