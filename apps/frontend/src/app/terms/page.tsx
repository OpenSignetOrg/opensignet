/* eslint-disable @next/next/no-html-link-for-pages -- Public pages use full navigation to avoid shipping router JavaScript. */

import type { Metadata } from 'next';
import { LegalDocument, LegalList, type LegalSection } from '@/components/legal/legal-document';
import { CONTACT } from '@/lib/contact';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Terms of Service',
  description:
    'The agreement for using OpenSignet: accounts and sign-in, your OpenSignet wallet, domains, DNS and email, plans and payments, renewals and acceptable use.',
  path: '/terms',
});

const sections: readonly LegalSection[] = [
  {
    id: 'agreement',
    title: 'The agreement',
    body: (
      <>
        <p>
          These terms are an agreement between you and OpenSignet for the use of opensignet.com, our
          APIs, SDKs, MCP server and every related service (together, the “Service”). OpenSignet is
          the agent-native identity and communications infrastructure: it provides domains, onchain
          names, DNS, email, identity and payments for people, developers and the AI agents they
          operate.
        </p>
        <p>
          By creating an account or using the Service you accept these terms and our{' '}
          <a href="/privacy">Privacy Policy</a>. If you use the Service for an organization, you
          confirm that you may accept these terms on its behalf.
        </p>
      </>
    ),
  },
  {
    id: 'account',
    title: 'Your account',
    body: (
      <>
        <p>
          You can sign in with Google, with a one-time code sent to your email, or with a wallet.
          There is one account per person: methods that share a verified email address, Google
          account or wallet reach the same account, and accounts are never merged.
        </p>
        <LegalList
          items={[
            'You must be at least 18 years old and able to enter a binding contract.',
            'Give accurate information and add only email addresses and wallets that you control.',
            'Keep your email account, Google account, wallets and devices secure. Activity from a signed-in session is treated as yours.',
            'Tell us promptly if you believe your account has been accessed without permission.',
          ]}
        />
        <p>OpenSignet will never ask for your private key, recovery phrase or one-time code.</p>
      </>
    ),
  },
  {
    id: 'wallet',
    title: 'Your OpenSignet wallet',
    body: (
      <>
        <p>
          Every account includes a wallet on Base, created with the account. Its private key is
          created and kept encrypted in our isolated wallet vault. While you are signed in, the
          vault uses it to pay OpenSignet for what you buy and for the renewals you turn on, with no
          code. Anything else (sending funds elsewhere, exporting the key, changing who approves)
          needs a code sent to your email or a signature from your linked wallet.
        </p>
        <LegalList
          items={[
            <>
              <strong>Only you decide what it pays.</strong> The vault pays only OpenSignet, only
              for a purchase you make or a renewal you keep on, and never more than that item may
              cost. We cannot view your private key or move your funds anywhere else, and our staff
              have no access to either.
            </>,
            <>
              <strong>Keep your approvals safe.</strong> Keep access to your account email and your
              linked wallet, and export your key to keep your own backup. If you lose every way to
              approve, we may be unable to restore access to the wallet’s funds.
            </>,
            <>
              <strong>Transactions are final.</strong> Blockchain transfers cannot be reversed.
              Check every address and amount before you approve.
            </>,
            <>
              <strong>Export is yours to protect.</strong> You can export the private key at any
              time. Anyone who obtains it controls the wallet.
            </>,
          ]}
        />
        <p>
          OpenSignet is not a bank, and wallet balances are not deposits. Move all funds out before
          you delete your account.
        </p>
      </>
    ),
  },
  {
    id: 'services',
    title: 'Domains, names, DNS and email',
    body: (
      <>
        <p>
          Domain names are registered through accredited registrars and are subject to the rules of
          their registry, the registrar’s terms and ICANN policies, including the Uniform
          Domain-Name Dispute-Resolution Policy. Registration requires the contact information those
          rules require.
        </p>
        <LegalList
          items={[
            'A name is yours only once its registration is confirmed. Availability and price can change until then.',
            'Onchain names such as Basenames and ENS names live on public blockchains and follow those protocols’ rules.',
            'You are responsible for the DNS records you publish and the mail you send and receive.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'payments',
    title: 'Plans, payments and refunds',
    body: (
      <>
        <p>
          Prices are shown before you pay. Plans apply to your whole account and are billed monthly
          or yearly, as you choose. You can pay by card through our payment processor or in USDC on
          Base. Prices exclude taxes unless stated otherwise.
        </p>
        <p>
          An upgrade to a higher plan starts when you pay, and the unused part of your current
          period is credited against its price. A change to a lower plan, or between monthly and
          yearly billing at a lower rate, starts at your next renewal; the current plan stays in
          place until then and is not refunded.
        </p>
        <p>
          Payments are final once provisioning or third-party work has begun, because registry fees
          and blockchain transfers cannot be reversed. A payment is refunded when OpenSignet marks
          it refund eligible, for example after a registration that could not be completed, or when
          the law requires it. A refund is a new transaction and does not reverse the original
          payment.
        </p>
      </>
    ),
  },
  {
    id: 'renewals',
    title: 'Renewals and expiry',
    body: (
      <>
        <p>
          Domains, names and plans run for the period you pay for. Automatic renewal is on by
          default when you buy, and you can turn it off or on again at any time. While it is on, you
          authorize OpenSignet to collect the renewal price from the payment method you chose (your
          OpenSignet wallet or your saved card) shortly before the end of each period. A change of
          payment method applies from the next renewal.
        </p>
        <LegalList
          items={[
            <>
              <strong>Plans paid by card</strong> renew on your default card through Stripe.
            </>,
            <>
              <strong>Plans paid in USDC</strong> renew from your OpenSignet wallet. Each renewal is
              signed only when it falls due, in the few days around its renewal date, and never for
              more than a year of the plan. Turning automatic renewal off stops it.
            </>,
            <>
              <strong>Domains</strong> renew yearly at the registrar’s renewal price, from your
              OpenSignet wallet or your saved card, as chosen for each domain. A renewal is taken
              from 30 days to 7 days before the domain expires. From the wallet it is never more
              than a quarter above the price when you turned it on; if the price rises further, we
              ask you first. If your card is declined, we try it once more a day later and email you
              each time.
            </>,
            <>
              <strong>Reminders.</strong> We email you 14, 7 and 1 day before a USDC plan renewal,
              with the amount and what to add if your wallet holds too little. Domains without
              automatic renewal get a reminder 30, 7 and 1 day before they expire.
            </>,
          ]}
        />
        <p>
          If a renewal is off or cannot be paid, the service expires at the end of its period. A
          plan paid in USDC stays usable for 7 days after a missed renewal, then ends. An expired
          domain can be lost to another registrant, and the mail, DNS and identity linked to it stop
          working.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You and the agents you operate must not use the Service to:</p>
        <LegalList
          items={[
            'send spam or any unsolicited bulk message;',
            'run phishing, fraud, malware or impersonation of any person or organization;',
            'publish or transmit unlawful content or infringe the rights of others;',
            'probe, overload or disrupt the Service, or bypass its limits and security controls;',
            'create accounts in bulk or by automated means other than our documented APIs.',
          ]}
        />
        <p>
          We monitor bounce and complaint rates and may limit sending, suspend a service or remove
          content to stop abuse, usually after notice but immediately when the risk is serious.
        </p>
      </>
    ),
  },
  {
    id: 'developers',
    title: 'APIs, keys and agents',
    body: (
      <>
        <p>
          API keys act with your account’s authority. Keep them secret, give each agent only the
          keys it needs, and revoke a key as soon as you suspect it is exposed. You are responsible
          for every action taken with your keys and by the agents you operate.
        </p>
        <p>
          Our public SDKs, MCP server and plugins are open source under the Apache License 2.0. That
          license governs the code; these terms govern the hosted Service.
        </p>
      </>
    ),
  },
  {
    id: 'content',
    title: 'Your content',
    body: (
      <p>
        You keep ownership of the content you store or send through the Service, such as DNS
        records, messages and profile details. You give us permission to host, process and transmit
        it only as needed to run the Service for you.
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension and closing your account',
    body: (
      <>
        <p>
          You can delete your account at any time in Settings. Before you do, move your wallet funds
          and transfer anything you want to keep, such as domains or mail. Deletion cannot be
          undone.
        </p>
        <p>
          We may suspend or close an account that breaches these terms, puts other users or the
          Service at risk, or where the law requires it. Where we can, we will tell you why and give
          you a chance to export your data.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <>
        <p>
          The Service is provided “as is” and “as available”. We work to keep it secure and reliable
          but do not promise that it will be uninterrupted or error-free.
        </p>
        <p>
          Public blockchains, smart contracts, registries and wallet software are operated by others
          and carry their own risks, including software defects, network congestion, changing fees
          and changes in law. We are not responsible for their operation.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <p>
        To the extent the law allows, OpenSignet is not liable for indirect, incidental, special or
        consequential losses, or for lost profits, data or digital assets. Our total liability for
        any claim relating to the Service is limited to the amount you paid us in the 12 months
        before the claim. Nothing in these terms limits liability that cannot be limited by law.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these terms as the Service develops. We will tell you about material changes
        by email or in the product before they take effect. If you keep using the Service after
        that, the updated terms apply.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        Questions about these terms can be sent to{' '}
        <a href={`mailto:${CONTACT.legal}`}>{CONTACT.legal}</a>. To report a security issue, follow
        the instructions on our <a href="/support">Support</a> page.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      path="/terms"
      title="Terms of Service"
      summary="The agreement for using OpenSignet: your account, your wallet, the services you register, how payments and renewals work, and the rules that keep the network safe."
      effective="2026-11-17"
      sections={sections}
      related={{ href: '/privacy', label: 'Read the Privacy Policy' }}
      contact={CONTACT.legal}
    />
  );
}
