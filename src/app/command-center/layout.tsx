import { Suspense, type ReactNode } from "react";

import { CommandCenterNav } from "./command-center-nav";

export default function CommandCenterLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <Suspense fallback={null}>
        <CommandCenterNav />
      </Suspense>
      {children}
    </>
  );
}
