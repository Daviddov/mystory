/** The draft terms of use in English, for visitors who chose the English interface. Same sections as the Hebrew ones. */
import Link from "@/components/i18n/LocaleLink";
import { routes } from "@/lib/routes";
import { DraftNotice, InfoPage, InfoSection, Missing } from "../about/_components/InfoPage";

export function TermsPageEn({ updated }: { updated: string }) {
  return (
    <InfoPage
      title="Terms of use"
      current={routes.terms()}
      lead="The site's rules in plain language: what you get, what we ask, and what happens to the books you make."
      notice={<DraftNotice updated={updated} locale="en" />}
    >
      <p className="text-lg leading-relaxed">
        This is a translation for convenience. If it differs from the Hebrew terms, the Hebrew ones apply.
      </p>

      <InfoSection id="service" title="1. The service">
        <p>
          &quot;My Story&quot; is a site for reading and listening to children&apos;s stories in Hebrew, with tools for
          making and uploading books. The site is run by <Missing locale="en">operator name and contact details</Missing>.
        </p>
        <p>
          Reading and listening to the books in the library are free and need no sign-up. Using the site means you
          accept these terms and the <Link href={routes.privacy()}>privacy policy</Link>.
        </p>
      </InfoSection>

      <InfoSection id="accounts" title="2. Accounts">
        <ul>
          <li>An account is needed to make, upload, save and share books.</li>
          <li>Only people aged 18 or over may open an account. Children use the site together with an adult, who is responsible for them.</li>
          <li>You are responsible for keeping your sign-in details safe and for everything done in your account.</li>
        </ul>
      </InfoSection>

      <InfoSection id="library" title="3. The books in the library">
        <ul>
          <li>Every book has a license and a source, shown on the book&apos;s page. What you may do with a book depends on its license.</li>
          <li>
            The site&apos;s original stories are reserved to the site: all rights reserved, and they may be used for
            personal use, that is reading, reading aloud and printing a copy for the family. They may not be
            distributed, sold or adapted without permission.
          </li>
          <li>Books by other creators are published under the license the creator chose, and its terms must be respected.</li>
          <li>Some stories and illustrations were made by Dov Bar; where this is the case, it is stated in the book&apos;s source field.</li>
        </ul>
      </InfoSection>

      <InfoSection id="your-content" title="4. Content you make and upload">
        <ul>
          <li>The text, pictures and recordings you uploaded remain yours.</li>
          <li>
            You allow us to store, process and show the content to you and to the people you shared it with, as far as
            needed to run the service.
          </li>
          <li>
            You confirm that you have the right to use everything you upload: it is yours, or its license allows it. Do
            not upload scanned commercial books or other copyrighted content without permission.
          </li>
          <li>Every book must have a license and a source.</li>
          <li>If you record the voice of, or upload a photo of, another person, you must get their consent.</li>
        </ul>
      </InfoSection>

      <InfoSection id="publishing" title="5. Private books, sharing and publishing">
        <ul>
          <li>A new book is private.</li>
          <li>A share link lets anyone who has it read the book. You are responsible for whom you send it to, and you can cancel it.</li>
          <li>
            You can ask to publish a book in the public library. An editor of the site reads every book before it is
            published, and may approve it, return it with notes or decline it, at their discretion.
          </li>
          <li>
            When a book is published in the library, it is published under the license you chose for it. A free license
            such as CC BY cannot be revoked for people who already received the book.
          </li>
          <li>We may remove a published book from the library at any time.</li>
        </ul>
      </InfoSection>

      <InfoSection id="ai" title="6. Making books with AI">
        <ul>
          <li>AI creation is limited by a quota, by default one book a week per account. The quota may change.</li>
          <li>
            The results are made automatically. Although they are checked for suitability for children, there may be
            mistakes in the content, the Hebrew, the nikud, the narration or the illustrations. Read the book yourself
            before reading it to a child.
          </li>
          <li>Do not use the wizard to make offensive or misleading content, or content showing a real person without their consent.</li>
          <li>
            When the site runs in demo mode, results are marked as a demo (&quot;sample story&quot;, &quot;sample
            illustration&quot;, &quot;demo voice&quot;) and are not real results.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="conduct" title="7. What is not allowed">
        <ul>
          <li>Uploading content unsuitable for children, or offensive, inciting or illegal content.</li>
          <li>Uploading content that infringes copyright, privacy or other rights of others.</li>
          <li>Trying to get around the creation quotas, harm the site&apos;s operation or reach other people&apos;s private books.</li>
          <li>Collecting information from the site automatically at a scale that burdens the service.</li>
        </ul>
        <p>We may remove content and block an account that breaks these terms.</p>
      </InfoSection>

      <InfoSection id="takedown" title="8. Reporting infringement or unsuitable content">
        <p>
          If you find content on the site that infringes your rights or is unsuitable for children, write to us at{" "}
          <Missing locale="en">reporting address</Missing> with the book&apos;s address and the nature of the problem. We
          will look into it and remove infringing content. <Missing locale="en">timeline for handling reports</Missing>
        </p>
      </InfoSection>

      <InfoSection id="liability" title="9. Liability">
        <p>
          The service is provided as is. We try to keep the site available, accurate and safe, but do not promise that it
          will work without faults or that all of its content is free of mistakes. The site is no substitute for adult
          supervision. <Missing locale="en">legal wording of the limitation of liability, under consumer protection law</Missing>
        </p>
      </InfoSection>

      <InfoSection id="changes" title="10. Changes, ending and governing law">
        <ul>
          <li>We may update the terms. The date at the top of the page will change, and we will tell account holders about a significant change in advance.</li>
          <li>You can stop using the site and delete your account at any time.</li>
          <li>
            <Missing locale="en">governing law and jurisdiction</Missing>
          </li>
        </ul>
      </InfoSection>
    </InfoPage>
  );
}
