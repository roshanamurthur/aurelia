"use client";

import { useAuthActions } from "@convex-dev/auth/react";

interface SignOutButtonProps {
  className?: string;
  children: React.ReactNode;
}

export default function SignOutButton({ className, children }: SignOutButtonProps) {
  const { signOut } = useAuthActions();

  return (
    <button
      type="button"
      onClick={() => signOut()}
      className={className}
    >
      {children}
    </button>
  );
}
