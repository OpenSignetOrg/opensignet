import type { Metadata } from 'next';
import { LegalDocument, LegalList, type LegalSection } from '@/components/legal/legal-document';
import { CONTACT } from '@/lib/contact';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Privacy Policy',
  description:
    'What OpenSignet collects when you sign in and use the Service, why, who processes it, how long it is kept and the choices you have.',
  path: '/privacy',
});

const sections: readonly LegalSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    body: (
      <>
        <p>
          This policy explains how OpenSignet handles personal information when you visit
          opensignet.com, sign in and use our services. We collect only what we need to run the
          Service and keep it secure.
        </p>
        <p>
          We do not sell personal information, and we do not use advertising trackers or third-party
          analytics.
        </p>
      </>
    ),
  },
  {
    id: 'collect',
    title: 'Information we collect',
    body: (
      <>
        <LegalList
          items={[
            <>
              <strong>Account details.</strong> Your email address, display name and profile photo,
              and which sign-in methods are linked to your account.
            </>,
            <>
              <strong>From Google, if you choose it.</strong> Your Google account identifier, email
              address, name and profile photo. We use the name and photo only to fill fields you
              have left empty.
            </>,
            <>
              <strong>Wallets.</strong> Public addresses of the wallets you connect, and the
              signatures you give to prove you control them.
            </>,
            <>
              <strong>Your OpenSignet wallet.</strong> Its public address, its private key kept
              encrypted in our isolated wallet vault, the approvals you give for its actions
              (including the renewal payments you approve in advance), and a tamper-evident log of
              what the vault did. No person at OpenSignet can view the private key.
            </>,
            <>
              <strong>Sign-in and security.</strong> One-time codes, which we store only in hashed
              form; for each signed-in device, its browser and operating system, approximate
              location and a shortened network address; and a log of sensitive account changes.
            </>,
            <>
              <strong>Services you use.</strong> Domains and onchain names, registration contact
              details, DNS records, mailbox messages and their metadata, API key labels and usage,
              and each identity’s sender name and logo. A logo is public by design: it is published
              with the domain so inboxes can show it to the people the identity writes to.
            </>,
            <>
              <strong>Payments.</strong> Plan, amount, status and, for crypto payments, the
              transaction on Base. Card details go directly to our payment processor; we never see
              the full card number. For a saved card we keep only its brand, last four digits and
              expiry.
            </>,
            <>
              <strong>Support.</strong> What you send us when you contact us.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'use',
    title: 'How we use it',
    body: (
      <LegalList
        items={[
          'To create and run your account and the services you order.',
          'To sign you in, keep your account secure and show you the devices that are signed in.',
          'To prevent fraud, spam and abuse, including limits on how often codes can be sent.',
          'To send sign-in codes and security notices, such as a new sign-in method, a wallet export or a change to who approves your wallet. These cannot be turned off while your account exists.',
          'To send product news only if you choose to receive it. Every such email has an unsubscribe link.',
          'To meet legal, tax and accounting obligations and to enforce our Terms of Service.',
        ]}
      />
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    body: (
      <>
        <p>We use only what the Service needs to work:</p>
        <LegalList
          items={[
            'a session cookie that keeps you signed in;',
            'a short-lived cookie that ties a one-time code to the browser that requested it;',
            'browser storage that remembers your connected wallet and the progress of a registration.',
          ]}
        />
        <p>
          To stop automated abuse, forms that send email codes use Cloudflare Turnstile, which
          checks limited technical signals from your browser. We use no advertising or tracking
          cookies.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    body: (
      <>
        <p>
          We share personal information only with providers that help us run the Service, and only
          what each one needs:
        </p>
        <LegalList
          items={[
            <>
              <strong>Google</strong>, when you sign in with or link a Google account.
            </>,
            <>
              <strong>Cloudflare</strong>, for hosting, network security, bot protection and storage
              of profile photos.
            </>,
            <>
              <strong>WalletConnect</strong>, when you connect a mobile wallet through it.
            </>,
            <>
              <strong>Payment processors</strong>, to handle card payments.
            </>,
            <>
              <strong>Registrars and registries</strong>, to register and renew domains. They
              receive the domain owner details you give us (name, email, phone and postal address)
              because registry rules require them. Domain privacy keeps them out of public WHOIS
              wherever the registry allows it. Details sent with a single registration request,
              without an account, are deleted from our systems once the registrar has them.
            </>,
          ]}
        />
        <p>
          We also disclose information when the law requires it, to protect people from harm or to
          defend our legal rights, and to a successor if OpenSignet is reorganized or sold, under
          this policy’s protections.
        </p>
      </>
    ),
  },
  {
    id: 'blockchain',
    title: 'Public blockchains',
    body: (
      <p>
        Wallet addresses, transactions and onchain names are recorded on public blockchains such as
        Base and Ethereum. Anyone can read them, and neither we nor anyone else can change or delete
        them. Consider this before you link a wallet address to your identity.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <LegalList
        items={[
          'Account details: until your account is deleted for good, 30 days after you delete it (or at once if you delete it again within those 30 days). A replaced profile photo is deleted right away.',
          'One-time codes and wallet approvals: deleted within one day after they expire.',
          'Signed-in device records: deleted 30 days after the session ends.',
          'Security log: 13 months.',
          'Mailbox messages: 15 days on the Free plan and 30 days on paid plans.',
          'Payment records: as long as tax and accounting law requires.',
        ]}
      />
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <p>
        All traffic is encrypted in transit. Session tokens and one-time codes are stored only as
        hashes, sensitive account changes require a fresh confirmation, and your wallet key is
        locked on your device before it reaches us. Access to production systems is restricted and
        logged. No system is perfectly secure; if a breach affects your information, we will tell
        you as the law requires.
      </p>
    ),
  },
  {
    id: 'choices',
    title: 'Your choices and rights',
    body: (
      <>
        <p>
          In Settings you can change your name, photo and email address, link or remove sign-in
          methods, sign out other devices, export your wallet and delete your account.
        </p>
        <p>
          Depending on where you live, you may also have the right to access, correct, delete or
          receive a copy of your information, and to object to or restrict how we use it. Email{' '}
          <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a> from the address on your
          account and we will respond within 30 days. You may also complain to your local data
          protection authority.
        </p>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'International transfers',
    body: (
      <p>
        We and our providers operate in several countries, so your information may be processed
        outside the country where you live. When it is, we rely on safeguards the law recognizes,
        such as standard contractual clauses.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        The Service is not intended for anyone under 18, and we do not knowingly collect their
        information. If you believe a child has given us personal information, contact us and we
        will delete it.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We will update this policy when our practices change and show the new effective date above.
        We will tell you about material changes by email or in the product before they take effect.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      path="/privacy"
      title="Privacy Policy"
      summary="What we collect when you sign in and use OpenSignet, why we need it, who helps us process it, how long we keep it and the control you have over it."
      effective="2026-11-17"
      sections={sections}
      related={{ href: '/terms', label: 'Read the Terms of Service' }}
      contact={CONTACT.privacy}
    />
  );
}
