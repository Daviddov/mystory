import { cn } from "@/lib/cn";
import { creditPeople, creditStatements, licenseDeedUrl, safeHttpUrl, type CreditBook } from "@/lib/credits";
import { mediaUrl } from "@/lib/media/url";

export interface BookCreditsProps {
  book: CreditBook & { updatedAt?: string };
  /** 'card' is the full block of the book page; 'compact' is the smaller one at the end of reading and on a share page. */
  variant?: "card" | "compact";
  /** Heading level of the title. Default 2. */
  headingLevel?: 2 | 3;
  /** Show the "source" line (the book page lists the source elsewhere). Default true. */
  showSource?: boolean;
  /**
   * The share token, ONLY on a page that was opened through a share link of an
   * unpublished book: the logo is a media file of the book (see mediaUrl()).
   */
  mediaToken?: string;
  className?: string;
  /** Prefix of the element ids; change it when two blocks are on one page. */
  id?: string;
}

/** True when a book has anything to credit. */
export function hasCredits(book: CreditBook): boolean {
  return (
    creditPeople(book).length > 0 ||
    creditStatements(book).length > 0 ||
    book.license.trim() !== "" ||
    !!book.credits?.publisher?.trim()
  );
}

// Links open in a new tab (the reader may be in full screen) and never pass the page address on.
const EXTERNAL = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;
const LINK = "font-semibold text-secondary underline underline-offset-4";

/**
 * Who made the book and under which terms it is shared: author, illustrator,
 * designer, editor, translator, the attribution line the license asks for,
 * the license (linked to its Creative Commons deed), and the original
 * publisher with a link and its logo. Renders nothing for a book without any
 * of these. Has no state, so it works in Server and Client Components.
 */
export function BookCredits({
  book,
  variant = "card",
  headingLevel = 2,
  showSource = true,
  mediaToken,
  className,
  id = "book-credits",
}: BookCreditsProps) {
  if (!hasCredits(book)) return null;

  const people = creditPeople(book);
  const statements = creditStatements(book);
  const license = book.license.trim();
  const deed = licenseDeedUrl(license);
  const publisher = book.credits?.publisher?.trim() ?? "";
  const publisherUrl = safeHttpUrl(book.credits?.publisherUrl);
  const logo = mediaUrl(book.credits?.publisherLogo, book.updatedAt, mediaToken);
  const source = book.source.trim();
  const sourceUrl = safeHttpUrl(source);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const logoAlt = `הלוגו של ${publisher || "המוציא לאור"}`;
  const logoImage = logo ? (
    <img src={logo} alt={logoAlt} loading="lazy" className="h-14 w-auto rounded-md bg-white p-1.5" />
  ) : null;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-testid="book-credits"
      className={cn(
        "flex flex-col gap-4 rounded-xl bg-surface text-start shadow-card",
        variant === "card" ? "p-5 sm:p-6" : "p-4",
        className,
      )}
    >
      <Heading id={`${id}-title`} className={variant === "card" ? "text-2xl font-bold" : "text-xl font-bold"}>
        קרדיטים
      </Heading>

      {people.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {people.map((line) => (
            <div key={line.key}>
              <dt className="text-sm font-semibold text-muted">{line.label}</dt>
              <dd dir={line.ltr ? "ltr" : "auto"} className="text-start text-lg">
                {line.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {statements.length > 0 ? (
        <div className="flex flex-col gap-1">
          {statements.map((statement) => (
            <p key={statement} dir="auto" className="text-start leading-relaxed">
              {statement}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {logoImage && publisherUrl ? (
          <a href={publisherUrl} {...EXTERNAL} aria-label={`${logoAlt} (נפתח בחלון חדש)`} className="shrink-0">
            {logoImage}
          </a>
        ) : (
          logoImage
        )}
        <ul className="flex min-w-0 flex-col gap-1">
          {publisher ? (
            <li>
              <span className="text-muted">פורסם במקור על ידי </span>
              {publisherUrl ? (
                <a href={publisherUrl} {...EXTERNAL} className={LINK}>
                  <bdi>{publisher}</bdi>
                  <span className="sr-only"> (נפתח בחלון חדש)</span>
                </a>
              ) : (
                <bdi>{publisher}</bdi>
              )}
            </li>
          ) : null}
          {license ? (
            <li>
              <span className="text-muted">רישיון: </span>
              {deed ? (
                <a href={deed} {...EXTERNAL} className={LINK}>
                  <bdi dir="ltr">{license}</bdi>
                  <span className="sr-only"> (נפתח בחלון חדש)</span>
                </a>
              ) : (
                <bdi>{license}</bdi>
              )}
            </li>
          ) : null}
          {showSource && source ? (
            <li className="min-w-0">
              <span className="text-muted">מקור: </span>
              {sourceUrl ? (
                <a href={sourceUrl} {...EXTERNAL} className={cn(LINK, "break-all")}>
                  <bdi dir="ltr">{source}</bdi>
                </a>
              ) : (
                <bdi className="break-all">{source}</bdi>
              )}
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
