import { handler, json } from "@/server/api";
import { renderEmail, sendMail } from "@/server/mail";

/** POST /api/v1/admin/test-email -> sends a test email to the caller. ADMIN only. */
export const POST = handler(
  async ({ user }) =>
    json({ sent: await sendMail({ to: user.email, subject: "Ugnayo test email", ...renderEmail("Ugnayo test email", "SMTP is configured correctly.", "/") }) }),
  { roles: ["ADMIN"] },
);
