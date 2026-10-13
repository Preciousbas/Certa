import { Body, Head, Html, Text } from "@react-email/components";

export function CertificateEmail({ project, amount }: { project: string; amount: string }) {
  return (
    <Html>
      <Head />
      <Body>
        <Text>
          Payment certificate for {project}. Net figure on the attached PDF: {amount}. The PDF uses the contract figures and the chain receipt, not an unlabelled model note.
        </Text>
      </Body>
    </Html>
  );
}

export async function sendCertificate(input: { to: string; subject: string; html: string; pdf: Uint8Array; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: "skipped" as const };
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Certa <certificates@certa.local>",
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: [{ filename: "certificate.pdf", content: Buffer.from(input.pdf) }],
    headers: { "Idempotency-Key": input.idempotencyKey },
  });
  return { status: "sent" as const, id: result.data?.id ?? null };
}
