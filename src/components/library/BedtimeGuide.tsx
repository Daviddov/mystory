import Link from "@/components/i18n/LocaleLink";
import { libraryMessages } from "@/lib/i18n/library";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { routes } from "@/lib/routes";

const LINK = "font-semibold text-primary underline-offset-4 hover:underline";

/**
 * A short guide under the bedtime category's books. Parents search for
 * "סיפורים לפני השינה" more than for anything else on the site, and a page that
 * is only a grid of covers gives search engines little to go on.
 */
export function BedtimeGuide({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const t = libraryMessages(locale).bedtime;
  return (
    <section aria-labelledby="bedtime-guide-title" className="flex max-w-3xl flex-col gap-4 text-lg leading-relaxed">
      <h2 id="bedtime-guide-title" className="text-2xl font-bold sm:text-3xl">
        {t.title}
      </h2>
      <p>{t.intro}</p>
      <h3 className="text-xl font-bold">{t.readOrListen}</h3>
      <p>
        {t.readOrListenText}
        <Link href={routes.listen()} className={LINK}>
          {t.listenLink}
        </Link>
        .
      </p>
      <h3 className="text-xl font-bold">{t.howLong}</h3>
      <p>
        {t.toddlers}
        <Link href={routes.age("0-2")} className={LINK}>
          {t.toddlersLink}
        </Link>
        {t.preschool}
        <Link href={routes.age("3-5")} className={LINK}>
          {t.preschoolLink}
        </Link>
        {t.busy}
        <Link href={routes.time("5")} className={LINK}>
          {t.busyLink}
        </Link>
        .
      </p>
      <p>{t.free}</p>
    </section>
  );
}
