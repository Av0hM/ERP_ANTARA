"use client";

import { useSession } from "next-auth/react";
import { AppRole } from "@antara/contracts";

import { FALLBACK_USER_ID, FALLBACK_USER_NAME, FALLBACK_USER_ROLE } from "@/lib/demo-context";

export function useActorProfile() {
  const { data } = useSession();

  return {
    id: data?.user?.id ?? FALLBACK_USER_ID,
    name: data?.user?.name ?? FALLBACK_USER_NAME,
    role: (data?.user?.role as AppRole | undefined) ?? FALLBACK_USER_ROLE,
    accessToken: data?.accessToken,
  };
}

