import { permanentRedirect } from 'next/navigation';

/** The wallet moved out of Settings into its own section. */
export default function SettingsWalletPage() {
  permanentRedirect('/wallet');
}
