import type { SealedProof } from './account-client';

/**
 * Seals an approval proof (an email code or a wallet signature) to the wallet vault's public key,
 * so the API in between relays only ciphertext. The scheme matches the vault exactly:
 * ECDH on P-256 with a fresh key, HKDF-SHA-256 (salt = sender key ‖ vault key, info = label),
 * then AES-256-GCM with the label as additional data.
 */
const PROOF_LABEL = 'opensignet/vault/proof/v1';

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export async function sealProof(
  vaultKeyBase64: string,
  proof: { challengeId: string; code?: string; signature?: string },
): Promise<SealedProof> {
  const encoder = new TextEncoder();
  const recipientRaw = fromBase64(vaultKeyBase64);
  const recipient = await crypto.subtle.importKey(
    'raw',
    recipientRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ]);
  const sender = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipient },
    ephemeral.privateKey,
    256,
  );
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const salt = new Uint8Array(sender.length + recipientRaw.length);
  salt.set(sender);
  salt.set(recipientRaw, sender.length);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(PROOF_LABEL) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(PROOF_LABEL) },
      key,
      encoder.encode(JSON.stringify(proof)),
    ),
  );
  return { epk: toBase64(sender), iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}
