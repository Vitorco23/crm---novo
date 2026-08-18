import React, { ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { PomodoroProvider } from "@/contexts/PomodoroContext";
import { AppLayout } from "@/shared/components/AppLayout";
import { ProtectedRoute } from "@/shared/components/ProtectedRoute";
import { PomodoroSessionFormDialog } from "@/modules/cold-call/components/PomodoroSessionFormDialog";

interface PrivateRouteWrapperProps {
  children: ReactNode;
}

export function PrivateRouteWrapper({ children }: PrivateRouteWrapperProps) {
  return (
    <AuthProvider>
      <PomodoroProvider>
        <ProtectedRoute>
          <AppLayout>
            {children}
          </AppLayout>
          <PomodoroSessionFormDialog />
        </ProtectedRoute>
      </PomodoroProvider>
    </AuthProvider>
  );
}
