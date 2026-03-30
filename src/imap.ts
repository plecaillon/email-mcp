import { ImapFlow } from "imapflow";
import type {
  ImapFlowOptions,
  ListResponse,
  FetchMessageObject,
  MessageEnvelopeObject,
  MessageAddressObject,
  MessageStructureObject,
  SearchObject,
} from "imapflow";
import type { AccountConfig } from "./accounts.js";

/** @internal */
export function imapConfigFromAccount(account: AccountConfig): ImapFlowOptions {
  const config: ImapFlowOptions = {
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecurity === "ssl",
    logger: false,
    tls: { rejectUnauthorized: account.sslVerify },
  };
  if (account.imapSecurity === "starttls") {
    config.secure = false;
  }
  if (account.password || account.imapSecurity !== "none") {
    config.auth = { user: account.username, pass: account.password };
  }
  return config;
}

function createClient(account: AccountConfig): ImapFlow {
  return new ImapFlow(imapConfigFromAccount(account));
}

function formatAddress(
  addr: MessageAddressObject | undefined
): string | undefined {
  if (!addr) return undefined;
  if (addr.name) return `${addr.name} <${addr.address}>`;
  return addr.address;
}

function formatAddresses(
  addrs: MessageAddressObject[] | undefined
): string[] | undefined {
  if (!addrs?.length) return undefined;
  return addrs.map((a) => formatAddress(a)).filter(Boolean) as string[];
}

interface MailboxInfo {
  name: string;
  path: string;
  delimiter: string;
  flags: string[];
  specialUse?: string;
}

export async function appendToMailbox(
  account: AccountConfig,
  mailbox: string,
  raw: Buffer,
  flags: string[] = ["\\Seen"]
): Promise<void> {
  const client = createClient(account);
  try {
    await client.connect();
    // Pass the mailbox path as a string[] rather than a plain string.
    //
    // Why: IMAP servers use different hierarchy delimiters — "/" on Gmail,
    // "." on Fastmail/Dovecot, etc. If we pass a raw string like "Sent/Work",
    // imapflow sends it verbatim; on a "." server the folder won't be found.
    //
    // imapflow's internal normalizePath() (lib/tools.js) handles string[]
    // specially: it joins the segments using the server's *actual* delimiter
    // (discovered during the NAMESPACE handshake after connect()) and prepends
    // the namespace prefix if required. This makes path resolution
    // server-agnostic regardless of what separator the user typed.
    //
    // Source: node_modules/imapflow/lib/commands/append.js line 25
    //   `destination = normalizePath(connection, destination)`
    // Source: node_modules/imapflow/lib/tools.js lines 43-64
    //   `if (Array.isArray(path)) { path = path.join(connection.namespace.delimiter) }`
    //
    // The TypeScript declaration (lib/imap-flow.d.ts) only exposes `string`
    // because the array overload was never added to the types — hence the cast.
    await client.append(mailbox.split("/") as unknown as string, raw, flags);
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function listMailboxes(account: AccountConfig): Promise<MailboxInfo[]> {
  const client = createClient(account);
  try {
    await client.connect();
    const list: ListResponse[] = await client.list();
    return list.map((m) => ({
      name: m.name,
      path: m.path,
      delimiter: m.delimiter,
      flags: Array.from(m.flags),
      specialUse: m.specialUse,
    }));
  } finally {
    await client.logout().catch(() => {});
  }
}

interface EmailSummary {
  uid: number;
  date: string | undefined;
  from: string[] | undefined;
  to: string[] | undefined;
  subject: string | undefined;
  flags: string[];
}

function messageToSummary(msg: FetchMessageObject): EmailSummary {
  return {
    uid: msg.uid,
    date: msg.envelope?.date?.toISOString?.() ?? String(msg.envelope?.date),
    from: formatAddresses(msg.envelope?.from),
    to: formatAddresses(msg.envelope?.to),
    subject: msg.envelope?.subject,
    flags: msg.flags ? Array.from(msg.flags) : [],
  };
}

interface ListEmailsResult {
  total: number;
  page: number;
  pageSize: number;
  emails: EmailSummary[];
}

export async function listEmails(
  account: AccountConfig,
  mailbox: string = "INBOX",
  page: number = 1,
  pageSize: number = 20
): Promise<ListEmailsResult> {
  const client = createClient(account);
  try {
    await client.connect();
    const mb = await client.mailboxOpen(mailbox, { readOnly: true });
    const total = mb.exists;

    if (total === 0) {
      return { total, page, pageSize, emails: [] };
    }

    // newest first: calculate sequence range
    const end = total - (page - 1) * pageSize;
    const start = Math.max(1, end - pageSize + 1);

    if (end < 1) {
      return { total, page, pageSize, emails: [] };
    }

    const messages = await client.fetchAll(`${start}:${end}`, {
      uid: true,
      flags: true,
      envelope: true,
    });

    // Sort newest first (by sequence/uid descending)
    messages.sort((a, b) => b.uid - a.uid);

    return {
      total,
      page,
      pageSize,
      emails: messages.map(messageToSummary),
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

interface AttachmentInfo {
  filename: string | undefined;
  size: number | undefined;
  contentType: string;
}

function collectAttachments(
  structure: MessageStructureObject | undefined
): AttachmentInfo[] {
  if (!structure) return [];
  const attachments: AttachmentInfo[] = [];

  function walk(node: MessageStructureObject): void {
    if (node.disposition === "attachment" || node.disposition === "inline") {
      if (
        node.disposition === "attachment" ||
        (node.dispositionParameters?.["filename"] ?? node.parameters?.["name"])
      ) {
        attachments.push({
          filename:
            node.dispositionParameters?.["filename"] ??
            node.parameters?.["name"],
          size: node.size,
          contentType: node.type,
        });
      }
    }
    if (node.childNodes) {
      for (const child of node.childNodes) {
        walk(child);
      }
    }
  }

  walk(structure);
  return attachments;
}

function findPart(
  structure: MessageStructureObject | undefined,
  type: string
): string | undefined {
  if (!structure) return undefined;

  function walk(node: MessageStructureObject): string | undefined {
    if (node.type === type && node.part) {
      return node.part;
    }
    if (node.childNodes) {
      for (const child of node.childNodes) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return undefined;
  }

  return walk(structure);
}

interface FetchEmailResult {
  uid: number;
  date: string | undefined;
  from: string[] | undefined;
  to: string[] | undefined;
  cc: string[] | undefined;
  subject: string | undefined;
  flags: string[];
  textBody: string | undefined;
  htmlBody: string | undefined;
  attachments: AttachmentInfo[];
}

export async function fetchEmail(
  account: AccountConfig,
  mailbox: string = "INBOX",
  uid: number
): Promise<FetchEmailResult> {
  const client = createClient(account);
  try {
    await client.connect();
    await client.mailboxOpen(mailbox, { readOnly: true });

    const msg = await client.fetchOne(String(uid), {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
    }, { uid: true });

    if (!msg) {
      throw new Error(`Message with UID ${uid} not found`);
    }

    const envelope: MessageEnvelopeObject | undefined = msg.envelope;
    const attachments = collectAttachments(msg.bodyStructure);

    // Download text and html parts
    let textBody: string | undefined;
    let htmlBody: string | undefined;

    const textPart = findPart(msg.bodyStructure, "text/plain");
    const htmlPart = findPart(msg.bodyStructure, "text/html");

    if (textPart) {
      const dl = await client.download(String(uid), textPart, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of dl.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      textBody = Buffer.concat(chunks).toString("utf-8");
    }

    if (htmlPart) {
      const dl = await client.download(String(uid), htmlPart, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of dl.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      htmlBody = Buffer.concat(chunks).toString("utf-8");
    }

    // If no parts found but it's a simple message, download full source
    if (!textPart && !htmlPart && !msg.bodyStructure?.childNodes) {
      const dl = await client.download(String(uid), undefined, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of dl.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const fullSource = Buffer.concat(chunks).toString("utf-8");
      if (msg.bodyStructure?.type === "text/html") {
        htmlBody = fullSource;
      } else {
        textBody = fullSource;
      }
    }

    return {
      uid: msg.uid,
      date: envelope?.date?.toISOString?.() ?? String(envelope?.date),
      from: formatAddresses(envelope?.from),
      to: formatAddresses(envelope?.to),
      cc: formatAddresses(envelope?.cc),
      subject: envelope?.subject,
      flags: msg.flags ? Array.from(msg.flags) : [],
      textBody,
      htmlBody,
      attachments,
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

interface SearchCriteria {
  from?: string;
  to?: string;
  subject?: string;
  since?: string;
  before?: string;
  body?: string;
  seen?: boolean;
}

export async function searchEmails(
  account: AccountConfig,
  mailbox: string = "INBOX",
  criteria: SearchCriteria,
  limit: number = 50
): Promise<EmailSummary[]> {
  const client = createClient(account);
  try {
    await client.connect();
    await client.mailboxOpen(mailbox, { readOnly: true });

    const query: SearchObject = {};
    if (criteria.from) query.from = criteria.from;
    if (criteria.to) query.to = criteria.to;
    if (criteria.subject) query.subject = criteria.subject;
    if (criteria.since) query.since = criteria.since;
    if (criteria.before) query.before = criteria.before;
    if (criteria.body) query.body = criteria.body;
    if (criteria.seen !== undefined) query.seen = criteria.seen;

    const uids = await client.search(query, { uid: true });
    if (!uids || uids.length === 0) return [];

    // Take last N UIDs (most recent)
    const selectedUids = uids.slice(-limit);
    const messages = await client.fetchAll(selectedUids.join(","), {
      uid: true,
      flags: true,
      envelope: true,
    }, { uid: true });

    messages.sort((a, b) => b.uid - a.uid);

    return messages.map(messageToSummary);
  } finally {
    await client.logout().catch(() => {});
  }
}

interface MoveEmailResult {
  uid: number;
  from: string;
  to: string;
  newUid: number | undefined;
}

export async function moveEmail(
  account: AccountConfig,
  mailbox: string,
  uid: number,
  destination: string
): Promise<MoveEmailResult> {
  const client = createClient(account);
  try {
    await client.connect();
    await client.mailboxOpen(mailbox);

    const result = await client.messageMove(String(uid), destination, {
      uid: true,
    });

    if (!result) {
      throw new Error(`Failed to move message UID ${uid} to ${destination}`);
    }

    // uidMap maps source UID -> destination UID
    let newUid: number | undefined;
    if (result.uidMap) {
      newUid = result.uidMap.get(uid);
    }

    return {
      uid,
      from: mailbox,
      to: destination,
      newUid,
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function deleteEmail(
  account: AccountConfig,
  mailbox: string,
  uid: number
): Promise<{ uid: number; mailbox: string; deleted: boolean }> {
  const client = createClient(account);
  try {
    await client.connect();
    await client.mailboxOpen(mailbox);

    const result = await client.messageDelete(String(uid), { uid: true });

    return { uid, mailbox, deleted: result };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function markEmail(
  account: AccountConfig,
  mailbox: string,
  uid: number,
  read: boolean
): Promise<{ uid: number; mailbox: string; read: boolean }> {
  const client = createClient(account);
  try {
    await client.connect();
    await client.mailboxOpen(mailbox);

    if (read) {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    } else {
      await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
    }

    return { uid, mailbox, read };
  } finally {
    await client.logout().catch(() => {});
  }
}
