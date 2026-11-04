import type { Metadata } from "next";
import { CreateWizard } from "@/components/create/CreateWizard";
import { ButtonLink, Card } from "@/components/ui";
import { getAiStatus } from "@/lib/ai";
import { requireUserPage } from "@/lib/auth";
import { JOB_STEPS, getUserQuota } from "@/lib/generation/server";
import { accountMessages, jobStepLabel, quotaText } from "@/lib/i18n/account";
import type { Locale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "יוצרים ספר אישי",
  description: "אשף בארבעה צעדים שיוצר ספר מאויר שבו הילד או הילדה שלכם הם הגיבורים.",
};

function formatDay(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(accountMessages(locale).dateLocale, { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(
    new Date(iso),
  );
}

export default async function CreatePage() {
  const user = await requireUserPage(routes.create());
  const quota = await getUserQuota(user);
  const ai = getAiStatus();
  const locale = await getLocale();
  const t = accountMessages(locale).createPage;

  // Out of quota (and nothing in progress): explain instead of showing a form that would be refused.
  if (quota.blocked === "weekly" || quota.blocked === "attempts") {
    return (
      <main className="container-page py-10">
        <Card padding="lg" className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
          <span aria-hidden="true" className="text-5xl">
            📚
          </span>
          <h1 className="text-3xl font-bold text-foreground">{t.blockedTitle}</h1>
          <p className="text-lg text-muted">{quotaText(locale, quota)}</p>
          {quota.availableAt ? (
            <p className="text-lg text-foreground">{t.availableFrom(formatDay(quota.availableAt, locale))}</p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={routes.studio()} size="lg">
              {t.myBooks}
            </ButtonLink>
            <ButtonLink href={routes.books()} variant="outline" size="lg">
              {t.library}
            </ButtonLink>
          </div>
        </Card>
      </main>
    );
  }

  const quotaLine = quota.unlimited
    ? t.unlimited
    : quota.limit === 1
      ? t.onePerWeek
      : t.perWeek(quota.limit, quota.remaining);

  return (
    <main className="container-page py-8">
      <CreateWizard
        activeJobId={quota.activeJob?.id}
        quotaLine={quotaLine}
        mock={{ text: ai.text.isMock, image: ai.image.isMock, tts: ai.tts.isMock }}
        steps={JOB_STEPS.map((item) => ({ step: item.step, label: jobStepLabel(locale, item.step, item.label) }))}
      />
    </main>
  );
}
