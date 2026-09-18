"use client";

import { useSession } from "next-auth/react";
import { AppRole } from "@antara/contracts";

export interface ActorProfile {
  id: string;
  name: string;
  role: AppRole;
  accessToken: string;
}

export function useActorProfile(): ActorProfile | null {
  const { data, status } = useSession();

  if (status === "loading") {
    return null;
  }

  if (!data?.user) {
    return null;
  }

  return {
    id: data.user.id!,
    name: data.user.name!,
    role: data.user.role as AppRole,
    accessToken: data.accessToken ?? "",
  };
}