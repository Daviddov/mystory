import { PersonalSync } from "@/components/personal/PersonalSync";
import { getCurrentUser } from "@/lib/auth";
import { InstallPrompt } from "./InstallPrompt";
import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";

/**
 * Everything the "returning users" features need on every page, in one place:
 * the service worker registration, the install prompt, and the sync of
 * favorites and reading progress between this device and the account.
 *
 * Mount once in the root layout, inside <body>:  <AppShellExtras />
 */
export async function AppShellExtras() {
  let userId: string | null = null;
  try {
    userId = (await getCurrentUser())?.id ?? null;
  } catch {
    // Auth unavailable: behave as signed out rather than break every page.
  }
  return (
    <>
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      <ServiceWorkerRegistration />
      <PersonalSync userId={userId} />
      <InstallPrompt />
    </>
  );
}
