import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listMailboxes, listEmails, fetchEmail, searchEmails, moveEmail, deleteEmail, markEmail } from "./imap.js";
import { sendEmail } from "./smtp.js";
import { loadAccounts, resolveAccount } from "./accounts.js";

// Load and validate all account configs (exits on error)
const accounts = loadAccounts();

console.error(`email-mcp starting (${accounts.length} account${accounts.length > 1 ? "s" : ""})`);
for (const acct of accounts) {
  console.error(`  [${acct.label}] ${acct.emailAddress}`);
  console.error(`    IMAP: ${acct.imapHost}:${acct.imapPort} (${acct.imapSecurity})`);
  console.error(`    SMTP: ${acct.smtpHost}:${acct.smtpPort} (${acct.smtpSecurity})`);
}

const server = new McpServer({
  name: "email-mcp",
  version: "0.1.0",
});

server.tool(
  "list_mailboxes",
  "List available mailboxes/folders",
  {
    account: z.string().optional().describe('Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'),
  },
  async ({ account }) => {
    try {
      const acct = resolveAccount(accounts, account);
      const mailboxes = await listMailboxes(acct);
      return {
        content: [{ type: "text", text: JSON.stringify({ account: acct.label, mailboxes }, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "list_emails",
  "List emails in a mailbox with pagination (newest first)",
  {
    account: z.string().optional().describe('Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'),
    mailbox: z.string().default("INBOX").describe("Mailbox path"),
    page: z.number().int().min(1).default(1).describe("Page number"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Emails per page"),
  },
  async ({ account, mailbox, page, pageSize }) => {
    try {
      const acct = resolveAccount(accounts, account);
      const result = await listEmails(acct, mailbox, page, pageSize);
      return {
        content: [{ type: "text", text: JSON.stringify({ account: acct.label, ...result }, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "fetch_email",
  "Fetch a single email by UID with full body and attachment info",
  {
    account: z.string().optional().describe('Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'),
    mailbox: z.string().default("INBOX").describe("Mailbox path"),
    uid: z.number().int().describe("Email UID"),
  },
  async ({ account, mailbox, uid }) => {
    try {
      const acct = resolveAccount(accounts, account);
      const result = await fetchEmail(acct, mailbox, uid);
      return {
        content: [{ type: "text", text: JSON.stringify({ account: acct.label, ...result }, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "search_emails",
  "Search emails by various criteria",
  {
    account: z.string().optional().describe('Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'),
    mailbox: z.string().default("INBOX").describe("Mailbox path"),
    from: z.string().optional().describe("From address to match"),
    to: z.string().optional().describe("To address to match"),
    subject: z.string().optional().describe("Subject to match"),
    since: z.string().optional().describe("Messages since date (ISO format)"),
    before: z.string().optional().describe("Messages before date (ISO format)"),
    body: z.string().optional().describe("Body text to match"),
    seen: z.boolean().optional().describe("Filter by read/unread status"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Max results"),
  },
  async ({ account, mailbox, from, to, subject, since, before, body, seen, limit }) => {
    try {
      const acct = resolveAccount(accounts, account);
      const result = await searchEmails(
        acct,
        mailbox,
        { from, to, subject, since, before, body, seen },
        limit
      );
      return {
        content: [{ type: "text", text: JSON.stringify({ account: acct.label, emails: result }, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "send_email",
  "Send an email via SMTP",
  {
    account: z.string().optional().describe('Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'),
    to: z
      .union([z.string(), z.array(z.string())])
      .describe("Recipient(s)"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body"),
    cc: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("CC recipient(s)"),
    bcc: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("BCC recipient(s)"),
    replyTo: z.string().optional().describe("Reply-To address"),
    isHtml: z
      .boolean()
      .default(false)
      .describe("Whether body is HTML"),
  },
  async ({ account, to, subject, body, cc, bcc, replyTo, isHtml }) => {
    try {
      const acct = resolveAccount(accounts, account);
      const result = await sendEmail(acct, to, subject, body, { cc, bcc, replyTo, isHtml });
      return {
        content: [{ type: "text", text: JSON.stringify({ account: acct.label, ...result }, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "move_email",
  "Move an email to another mailbox/folder (e.g. archive, junk, sent)",
  {
    account: z.string().optional().describe('Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'),
    mailbox: z.string().default("INBOX").describe("Source mailbox path"),
    uid: z.number().int().describe("Email UID to move"),
    destination: z.string().describe("Destination mailbox path (e.g. Archive, Junk, Trash)"),
  },
  async ({ account, mailbox, uid, destination }) => {
    try {
      const acct = resolveAccount(accounts, account);
      const result = await moveEmail(acct, mailbox, uid, destination);
      return {
        content: [{ type: "text", text: JSON.stringify({ account: acct.label, ...result }, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "mark_email",
  "Mark an email as read or unread",
  {
    account: z.string().optional().describe('Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'),
    mailbox: z.string().default("INBOX").describe("Mailbox path"),
    uid: z.number().int().describe("Email UID to mark"),
    read: z.boolean().describe("True to mark as read, false to mark as unread"),
  },
  async ({ account, mailbox, uid, read }) => {
    try {
      const acct = resolveAccount(accounts, account);
      const result = await markEmail(acct, mailbox, uid, read);
      return {
        content: [{ type: "text", text: JSON.stringify({ account: acct.label, ...result }, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "delete_email",
  "Permanently delete an email (sets \\Deleted flag and expunges)",
  {
    account: z.string().optional().describe('Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'),
    mailbox: z.string().default("INBOX").describe("Mailbox path"),
    uid: z.number().int().describe("Email UID to delete"),
  },
  async ({ account, mailbox, uid }) => {
    try {
      const acct = resolveAccount(accounts, account);
      const result = await deleteEmail(acct, mailbox, uid);
      return {
        content: [{ type: "text", text: JSON.stringify({ account: acct.label, ...result }, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("email-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
