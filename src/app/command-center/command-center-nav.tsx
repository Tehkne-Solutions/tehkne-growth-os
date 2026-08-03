"use client";

import { usePathname, useSearchParams } from "next/navigation";

import styles from "./command-center-nav.module.css";

export function CommandCenterNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const suffix = query ? `?${query}` : "";

  return (
    <nav className={styles.nav} aria-label="Navegação do Command Center">
      <a className={styles.link} data-active={pathname === "/command-center"} href={`/command-center${suffix}`}>Intelligence</a>
      <a className={styles.link} data-active={pathname === "/command-center/action-workspace"} href={`/command-center/action-workspace${suffix}`}>Action Workspace</a>
      <a className={styles.link} data-active={pathname === "/command-center/attribution"} href={`/command-center/attribution${suffix}`}>Attribution</a>
      <a className={styles.link} data-active={pathname === "/command-center/connectors"} href={`/command-center/connectors${suffix}`}>Connectors</a>
    </nav>
  );
}
