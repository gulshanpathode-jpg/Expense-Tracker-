// Blackboxed mail delivery. The app only talks to this interface; the real
// SendGrid integration will be wired in here later (SENDGRID_API_KEY etc.)
// without touching any caller.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  // TODO(sendgrid): replace with @sendgrid/mail once credentials are available.
  console.log(`[mailer] To: ${msg.to} | Subject: ${msg.subject}\n[mailer] ${msg.text}`);
}

export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  await sendMail({
    to,
    subject: 'Your ExpTrack password reset code',
    text: `Your verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
  });
}
