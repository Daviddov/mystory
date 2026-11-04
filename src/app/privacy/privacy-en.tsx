/** The privacy policy in English, for visitors who chose the English interface. Same sections as the Hebrew one. */
import Link from "next/link";
import { routes } from "@/lib/routes";
import { InfoPage, InfoSection } from "../about/_components/InfoPage";

export function PrivacyPageEn({ updated, email }: { updated: string; email: string }) {
  return (
    <InfoPage
      title="Privacy policy"
      current={routes.privacy()}
      lead="The site is made for families with young children, so we collect as little information as we can. Here is what is kept, why, and what is not kept at all."
      notice={<p className="text-muted">Last updated: {updated}</p>}
    >
      <p className="text-lg leading-relaxed">
        This is a translation for convenience. If it differs from the Hebrew policy, the Hebrew one applies.
      </p>

      <InfoSection id="summary" title="In short">
        <ul>
          <li>Reading and listening need no sign-up, and we do not identify who reads.</li>
          <li>There are no ads and no advertising tracking.</li>
          <li>There are no child profiles. An account belongs to a parent only.</li>
          <li>
            From a Google account we receive only a name, email address and profile picture, and use them only to sign
            you in.
          </li>
          <li>
            A child&apos;s photo uploaded to the creation wizard is not kept. It is used once to describe the character and
            is then deleted from memory.
          </li>
          <li>A book you made is private until you choose to share it or ask to publish it.</li>
          <li>We do not sell personal information or pass it to advertisers.</li>
        </ul>
      </InfoSection>

      <InfoSection id="who" title="Who is responsible for the information">
        <p>
          The site &quot;My Story&quot; (mystory-alpha.vercel.app) is run by the My Story team. Privacy questions,
          requests to see your information and deletion requests can be sent to{" "}
          <a href={`mailto:${email}`}>{email}</a>. We try to answer within 14 days.
        </p>
      </InfoSection>

      <InfoSection id="without-account" title="Information kept without an account">
        <p>Readers who do not sign in give us no identifying details. A few things are still kept:</p>
        <ul>
          <li>
            <strong>On your device only:</strong> the last page you read in each book, your text size, day or bedtime
            mode, your interface language, and books downloaded for offline reading. This stays in your browser and is
            not sent to us. You can delete it at any time in your browser settings.
          </li>
          <li>
            <strong>View counter:</strong> we count how many times each book is opened, to show popular books. The
            counter does not record who opened it.
          </li>
          <li>
            <strong>Visit statistics:</strong> we use Vercel Web Analytics to count page visits. It uses no cookies and
            does not recognize visitors across sites or days.
          </li>
          <li>
            <strong>Technical logs:</strong> like any website, the hosting provider logs IP address, browser type and
            time of access for security and operations. The logs are kept by the hosting provider for a short time,
            under its retention policy, and are not used to identify readers.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="account" title="Information kept in a parent's account">
        <p>
          Making, uploading and saving books requires an account. You sign in with a Google account or with a one-time
          link sent by email, without a password. The account keeps:
        </p>
        <ul>
          <li>Name and email address.</li>
          <li>The books you made: the text, pictures, recordings and the details you filled in.</li>
          <li>Your favorites, playlists and reading progress, so they appear on every device you sign in on.</li>
          <li>A log of AI creation requests, to enforce the weekly quota and measure the cost.</li>
        </ul>
        <p>
          Accounts are for adults aged 18 and over. We do not open accounts for children, and we do not ask for
          identifying details about children beyond what the parent chooses to write in the story.
        </p>
      </InfoSection>

      <InfoSection id="google" title="Signing in with Google">
        <p>When you choose &quot;Sign in with Google&quot;, we ask Google only for the basic scopes (openid, email, profile):</p>
        <ul>
          <li>
            <strong>What we receive:</strong> your Google account ID, email address, full name and profile picture URL.
          </li>
          <li>
            <strong>Why:</strong> to create your account on the site, recognize you when you sign in again and show
            your name in the account menu. The email address is also used to contact you about your account.
          </li>
          <li>
            <strong>What we do not receive:</strong> no access to Gmail, Calendar, Contacts, Drive or any other data in
            your Google account, and never your password.
          </li>
          <li>
            <strong>Where it is kept:</strong> in the sign-in system of Supabase, our database provider. It is not sold,
            not passed to advertisers and not used to train AI models.
          </li>
          <li>
            <strong>Deletion:</strong> you can ask us to delete your account and the data we received from Google by
            writing to the address above. You can also revoke the site&apos;s access at any time on your{" "}
            <a href="https://myaccount.google.com/connections" rel="noopener noreferrer" target="_blank">
              Google account connections page
            </a>
            .
          </li>
        </ul>
        <p>
          Our use and transfer to any other app of information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer" target="_blank">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </InfoSection>

      <InfoSection id="child-photos" title="Children's photos and details">
        <p>
          In the personal book wizard you may, if you wish, upload a photo of the child. It is optional; you can
          describe the child in words instead.
        </p>
        <ul>
          <li>The photo has one purpose: writing a text description of an illustrated character who looks like the child.</li>
          <li>For that, the photo is sent once to the language model service described below. It is not sent to the illustration service.</li>
          <li>
            The photo is held in server memory only and deleted right after use. It is not saved to a file, the database
            or the book, and is shown to no one.
          </li>
          <li>The pictures in the book are drawings of a character, not the photo itself.</li>
        </ul>
        <p>
          The name, age and hobbies typed into the wizard are used to write the story, so they are kept as part of the
          book&apos;s text and the creation request. Write only what you are comfortable seeing in the book.
        </p>
      </InfoSection>

      <InfoSection id="private-books" title="Private books, sharing and publishing">
        <ul>
          <li>A book you made is private. It does not appear in the library, in search or in search engines.</li>
          <li>
            If you made a share link, anyone with the link can read the book. You can cancel the link at any time, and it
            stops working from then on.
          </li>
          <li>A book is published in the public library only if you asked, and only after an editor of the site approved it.</li>
          <li>Editors and administrators of the site can see private books, for approval, support and handling complaints.</li>
        </ul>
        <p>
          <strong>Known limitation:</strong> the picture and recording files of a private book are served from an
          address that is hard to guess, but not password-protected. Someone who has the full address of a file can open
          it without a share link.
        </p>
      </InfoSection>

      <InfoSection id="third-parties" title="Outside services">
        <p>To run the site we use outside providers, who receive only the information they need:</p>
        <ul>
          <li>
            <strong>Hosting:</strong> Vercel, which runs the site&apos;s servers and provides the visit statistics.
          </li>
          <li>
            <strong>Database, sign-in and file storage:</strong> Supabase, where account details, books and their files
            are kept.
          </li>
          <li>
            <strong>Sign-in:</strong> Google, when you choose to sign in with a Google account.
          </li>
          <li>
            <strong>Writing stories and describing the character:</strong> the details you typed in the wizard, and the
            photo if you uploaded one, are sent to a language model service (Google Gemini or Anthropic Claude) to write
            the story and check that it suits children.
          </li>
          <li>
            <strong>Illustrations and narration:</strong> the character description, the page descriptions and the story
            text are sent to Google Gemini to make illustrations and narration.
          </li>
          <li>
            <strong>Nikud:</strong> the story text is sent to Dicta&apos;s nikud (Hebrew vowel marks) service. Only the
            text is sent, without account details.
          </li>
        </ul>
        <p>We do not sell personal information or pass it to advertisers.</p>
      </InfoSection>

      <InfoSection id="cookies" title="Cookies and browser storage">
        <p>
          The site uses only necessary cookies: one keeps you signed in, and one remembers the interface language you
          chose. There are no advertising cookies and no third-party cookies. Preferences and reading progress are kept
          in your browser&apos;s local storage, as described above.
        </p>
      </InfoSection>

      <InfoSection id="retention" title="How long information is kept and how to delete it">
        <ul>
          <li>Account details and books are kept as long as the account is active.</li>
          <li>A book you deleted is deleted together with its pictures and recordings.</li>
          <li>
            You can ask to delete your account by writing to the address above. We delete the account details,
            favorites, progress and private books within 30 days of the request.
          </li>
          <li>
            A book published in the library under a free license may stay there after the account is deleted, according
            to the license you chose.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="rights" title="Your rights">
        <p>
          Under Israel&apos;s Privacy Protection Law, 5741-1981, you may see the information kept about you and ask to
          correct or delete it. Send the request to the address above.
        </p>
      </InfoSection>

      <InfoSection id="changes" title="Changes to this policy">
        <p>
          When the policy changes, the date at the top of the page is updated. We will tell account holders about a
          significant change before it takes effect. Use of the site is also subject to the{" "}
          <Link href={routes.terms()}>terms of use</Link>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
