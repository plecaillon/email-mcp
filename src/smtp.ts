import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { appendToMailbox } from "./imap.js";
import type { AccountConfig } from "./accounts.js";

export function smtpConfigFromAccount(account: AccountConfig): SMTPTransport.Options {
  const config: SMTPTransport.Options = {
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecurity === "ssl",
    requireTLS: account.smtpSecurity === "starttls",
    tls: { rejectUnauthorized: account.sslVerify },
  };
  if (account.password || account.smtpSecurity !== "none") {
    config.auth = { user: account.username, pass: account.password };
  }
  return config;
}

interface SendEmailOptions {
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  isHtml?: boolean;
}

interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  savedToSent: boolean;
  savedToSentError?: string;
}

export async function sendEmail(
  account: AccountConfig,
  to: string | string[],
  subject: string,
  body: string,
  options: SendEmailOptions = {}
): Promise<SendEmailResult> {
  const transporter: Transporter = nodemailer.createTransport(smtpConfigFromAccount(account));
  const from = account.emailAddress;

  const toStr = Array.isArray(to) ? to.join(", ") : to;
  const ccStr = options.cc
    ? Array.isArray(options.cc)
      ? options.cc.join(", ")
      : options.cc
    : undefined;
  const bccStr = options.bcc
    ? Array.isArray(options.bcc)
      ? options.bcc.join(", ")
      : options.bcc
    : undefined;

  const mailOptions = {
    from,
    to: toStr,
    subject,
    ...(options.isHtml ? { html: body } : { text: body }),
    ...(ccStr ? { cc: ccStr } : {}),
    ...(bccStr ? { bcc: bccStr } : {}),
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  };

  try {
    const info = await transporter.sendMail(mailOptions);

    const sentFolder = account.sentFolder;

    // Build a properly encoded RFC 2822 message using the actual Message-ID
    // that was assigned during send. MailComposer handles non-ASCII encoding,
    // BCC headers, and attachments correctly.
    const raw = await new MailComposer({
      ...mailOptions,
      messageId: info.messageId,
    })
      .compile()
      .build();

    let savedToSent = false;
    let savedToSentError: string | undefined;
    try {
      await appendToMailbox(account, sentFolder, raw);
      savedToSent = true;
    } catch (e) {
      savedToSentError = e instanceof Error ? e.message : String(e);
      console.error(`[email-mcp] Failed to save to Sent folder: ${savedToSentError}`);
    }

    return {
      messageId: info.messageId,
      accepted: info.accepted as string[],
      rejected: info.rejected as string[],
      savedToSent,
      ...(savedToSentError ? { savedToSentError } : {}),
    };
  } finally {
    transporter.close();
  }
}
