import { cn } from "@/shared/utils/utils";
import { ReactNode } from "react";

type Width = "sm" | "md" | "lg" | "xl" | "full";

const widthClass: Record<Width, string> = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  xl: "max-w-[1600px]",
  full: "max-w-none",
};

interface Props {
  children: ReactNode;
  className?: string;
  width?: Width;
  /** Remove padding lateral/vertical (útil para kanbans de largura total). */
  bleed?: boolean;
}

/**
 * Container padrão da área de conteúdo do Application Shell.
 * Aplica largura máxima, padding e espaçamento vertical consistentes.
 */
export function PageContainer({ children, className, width = "xl", bleed = false }: Props) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        widthClass[width],
        !bleed && "px-4 md:px-6 py-4 md:py-6",
        "space-y-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
