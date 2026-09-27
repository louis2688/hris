import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@hris/db";
import type { SessionUser } from "@hris/shared";
import { audit } from "./audit";
import { AppError } from "./errors";

const CHALLENGE_COOKIE = "hris_wa";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "");

/** Relying party = the host the browser is on (works for localhost, preview and prod domains). */
async function rp() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { rpID: host.split(":")[0]!, origin: `${proto}://${host}` };
}

// ponytail: challenge lives in a signed, 2-minute, user-bound cookie instead of a table. Move to DB if you need strict single-use.
async function setChallenge(userId: string, challenge: string, purpose: "reg" | "auth") {
  const token = await new SignJWT({ c: challenge, p: purpose }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setExpirationTime("2m").sign(secret());
  (await cookies()).set(CHALLENGE_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 120 });
}

async function takeChallenge(userId: string, purpose: "reg" | "auth") {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!token) throw new AppError("Verification expired, try again", "CHALLENGE_EXPIRED");
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.sub !== userId || payload.p !== purpose) throw new Error();
    return String(payload.c);
  } catch {
    throw new AppError("Verification expired, try again", "CHALLENGE_EXPIRED");
  }
}

export const listPasskeys = (userId: string) =>
  prisma.passkey.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, createdAt: true, lastUsedAt: true, transports: true } });

export async function registrationOptions(user: SessionUser) {
  const { rpID } = await rp();
  const existing = await prisma.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName: "HRIS",
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports })),
    // Platform authenticator = the phone/laptop's own fingerprint or face sensor.
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
  });
  await setChallenge(user.id, options.challenge, "reg");
  return options;
}

export async function verifyRegistration(user: SessionUser, response: RegistrationResponseJSON, name: string) {
  const { rpID, origin } = await rp();
  const expectedChallenge = await takeChallenge(user.id, "reg");
  const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  if (!v.verified) throw new AppError("Could not verify this device");
  const c = v.registrationInfo.credential;
  const row = await prisma.passkey.create({
    data: { userId: user.id, credentialId: c.id, publicKey: new Uint8Array(c.publicKey), counter: c.counter, transports: c.transports ?? [], name: name || "This device" },
  });
  await audit(user.id, "passkey.register", "Passkey", row.id, { after: { name: row.name } });
  return row;
}

export async function authenticationOptions(user: SessionUser) {
  const { rpID } = await rp();
  const creds = await prisma.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  if (!creds.length) throw new AppError("Set up fingerprint or Face ID first (My Info > Security)", "NO_PASSKEY");
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: creds.map((c) => ({ id: c.credentialId, transports: c.transports })) });
  await setChallenge(user.id, options.challenge, "auth");
  return options;
}

/** Throws unless the assertion proves this user just passed their device's biometric check. */
export async function verifyAuthentication(user: SessionUser, response: AuthenticationResponseJSON) {
  const { rpID, origin } = await rp();
  const expectedChallenge = await takeChallenge(user.id, "auth");
  const cred = await prisma.passkey.findUnique({ where: { credentialId: response.id } });
  if (!cred || cred.userId !== user.id) throw new AppError("Unknown device, register it again", "UNKNOWN_PASSKEY", 403);
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: { id: cred.credentialId, publicKey: new Uint8Array(cred.publicKey), counter: cred.counter, transports: cred.transports },
  });
  if (!v.verified) throw new AppError("Biometric check failed", "PASSKEY_FAILED", 403);
  await prisma.passkey.update({ where: { id: cred.id }, data: { counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() } });
}

export async function deletePasskey(user: SessionUser, id: string) {
  await prisma.passkey.delete({ where: { id, userId: user.id } });
  await audit(user.id, "passkey.delete", "Passkey", id);
}
