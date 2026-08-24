import { motion, useReducedMotion } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";

// Transition deliberately avoids transforms on the page container: fixed/sticky
// elements keep their positioning and navigation feels immediate.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
