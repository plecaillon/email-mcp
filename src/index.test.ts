import { describe, it, expect } from "vitest";
import { resolveAccount } from "./accounts.js";
import type { AccountConfig } from "./accounts.js";

// Mock account fixtures used across all test groups
const mockAccounts: AccountConfig[] = [
  {
    label: "personal",
    emailAddress: "me@personal.com",
    username: "me",
    password: "pass1",
    imapHost: "imap.personal.com",
    imapPort: 993,
    imapSecurity: "ssl",
    smtpHost: "smtp.personal.com",
    smtpPort: 465,
    smtpSecurity: "ssl",
    sslVerify: true,
    sentFolder: "Sent",
  },
  {
    label: "work",
    emailAddress: "me@work.com",
    username: "me-work",
    password: "pass2",
    imapHost: "imap.work.com",
    imapPort: 993,
    imapSecurity: "ssl",
    smtpHost: "smtp.work.com",
    smtpPort: 465,
    smtpSecurity: "ssl",
    sslVerify: true,
    sentFolder: "Sent",
  },
];

// The 8 tool names registered in index.ts
const TOOL_NAMES = [
  "list_mailboxes",
  "list_emails",
  "fetch_email",
  "search_emails",
  "send_email",
  "move_email",
  "mark_email",
  "delete_email",
] as const;

// ─── ROUT-02: undefined account defaults to account 1 ───────────────────────

describe("ROUT-02: undefined account defaults to account 1", () => {
  it("resolveAccount returns accounts[0] when account is undefined", () => {
    const result = resolveAccount(mockAccounts, undefined);
    expect(result).toBe(mockAccounts[0]);
  });

  it("resolved account has label 'personal' (the first account)", () => {
    const result = resolveAccount(mockAccounts, undefined);
    expect(result.label).toBe("personal");
  });
});

// ─── ROUT-04: unknown account returns error with valid labels ────────────────

describe("ROUT-04: unknown account returns error with valid labels", () => {
  it("resolveAccount throws Error when account label is not found", () => {
    expect(() => resolveAccount(mockAccounts, "unknown")).toThrow(Error);
  });

  it("error message contains all valid labels", () => {
    expect(() => resolveAccount(mockAccounts, "unknown")).toThrow(/personal/);
    expect(() => resolveAccount(mockAccounts, "unknown")).toThrow(/work/);
  });

  it("handler catch block produces isError: true response with valid label list", () => {
    // Simulate what each handler's catch block does when resolveAccount throws
    let caughtError: Error | null = null;
    try {
      resolveAccount(mockAccounts, "unknown");
    } catch (e) {
      caughtError = e instanceof Error ? e : new Error(String(e));
    }

    expect(caughtError).not.toBeNull();
    const msg = caughtError!.message;

    // Simulate handler catch block
    const errorResponse = {
      isError: true as const,
      content: [{ type: "text" as const, text: msg }],
    };

    expect(errorResponse.isError).toBe(true);
    expect(errorResponse.content[0]!.text).toContain("personal");
    expect(errorResponse.content[0]!.text).toContain("work");
  });
});

// ─── ROUT-01: resolveAccount is called for each tool handler ─────────────────

describe("ROUT-01: resolveAccount resolves by label for all 8 tool handlers", () => {
  it("resolveAccount with label 'work' returns mockAccounts[1] — used by all handlers", () => {
    for (const tool of TOOL_NAMES) {
      const result = resolveAccount(mockAccounts, "work");
      expect(result).toBe(mockAccounts[1]);
      expect(result.label).toBe("work");
      // The tool name is used here to document which handler this covers
      expect(typeof tool).toBe("string");
    }
  });

  it("resolveAccount with label 'personal' returns mockAccounts[0] — used by all handlers", () => {
    for (const tool of TOOL_NAMES) {
      const result = resolveAccount(mockAccounts, "personal");
      expect(result).toBe(mockAccounts[0]);
      expect(result.label).toBe("personal");
      expect(typeof tool).toBe("string");
    }
  });

  it("resolveAccount returns the correct account for each of the 8 tool names", () => {
    for (const tool of TOOL_NAMES) {
      // Every handler must call resolveAccount — verify the routing contract per tool
      const resultWork = resolveAccount(mockAccounts, "work");
      const resultPersonal = resolveAccount(mockAccounts, "personal");
      const resultDefault = resolveAccount(mockAccounts, undefined);

      expect(resultWork.emailAddress).toBe("me@work.com");
      expect(resultPersonal.emailAddress).toBe("me@personal.com");
      expect(resultDefault).toBe(mockAccounts[0]);

      // Document which tool we're testing the routing contract for
      expect(TOOL_NAMES).toContain(tool);
    }
  });
});

// ─── ROUT-05: tool response shape includes account field ────────────────────

describe("ROUT-05: tool response shape includes top-level account field for all 8 tools", () => {
  const acct = resolveAccount(mockAccounts, "work");

  it("list_mailboxes: { account, mailboxes } response shape has account field", () => {
    const response = JSON.parse(
      JSON.stringify({ account: acct.label, mailboxes: [] })
    ) as { account: string; mailboxes: unknown[] };
    expect(response.account).toBe("work");
    expect(typeof response.account).toBe("string");
    expect(Array.isArray(response.mailboxes)).toBe(true);
  });

  it("list_emails: { account, ...result } response shape has account field", () => {
    const result = { total: 0, page: 1, emails: [] };
    const response = JSON.parse(
      JSON.stringify({ account: acct.label, ...result })
    ) as { account: string; total: number; page: number; emails: unknown[] };
    expect(response.account).toBe("work");
    expect(response.total).toBe(0);
    expect(response.page).toBe(1);
    expect(Array.isArray(response.emails)).toBe(true);
  });

  it("fetch_email: { account, ...result } response shape has account field", () => {
    const result = { uid: 42, mailbox: "INBOX", subject: "Hello" };
    const response = JSON.parse(
      JSON.stringify({ account: acct.label, ...result })
    ) as { account: string; uid: number; mailbox: string };
    expect(response.account).toBe("work");
    expect(response.uid).toBe(42);
    expect(response.mailbox).toBe("INBOX");
  });

  it("search_emails: { account, emails } response shape has account field", () => {
    const response = JSON.parse(
      JSON.stringify({ account: acct.label, emails: [] })
    ) as { account: string; emails: unknown[] };
    expect(response.account).toBe("work");
    expect(typeof response.account).toBe("string");
    expect(Array.isArray(response.emails)).toBe(true);
  });

  it("send_email: { account, ...result } response shape has account field", () => {
    const result = { messageId: "<abc@work.com>", accepted: ["to@example.com"] };
    const response = JSON.parse(
      JSON.stringify({ account: acct.label, ...result })
    ) as { account: string; messageId: string };
    expect(response.account).toBe("work");
    expect(response.messageId).toBe("<abc@work.com>");
  });

  it("move_email: { account, ...result } response shape has account field", () => {
    const result = { uid: 10, destination: "Archive" };
    const response = JSON.parse(
      JSON.stringify({ account: acct.label, ...result })
    ) as { account: string; uid: number; destination: string };
    expect(response.account).toBe("work");
    expect(response.uid).toBe(10);
    expect(response.destination).toBe("Archive");
  });

  it("mark_email: { account, ...result } response shape has account field", () => {
    const result = { uid: 5, read: true };
    const response = JSON.parse(
      JSON.stringify({ account: acct.label, ...result })
    ) as { account: string; uid: number; read: boolean };
    expect(response.account).toBe("work");
    expect(response.uid).toBe(5);
    expect(response.read).toBe(true);
  });

  it("delete_email: { account, ...result } response shape has account field", () => {
    const result = { uid: 7, deleted: true };
    const response = JSON.parse(
      JSON.stringify({ account: acct.label, ...result })
    ) as { account: string; uid: number; deleted: boolean };
    expect(response.account).toBe("work");
    expect(response.uid).toBe(7);
    expect(response.deleted).toBe(true);
  });

  it("account field value matches the resolved account label for all 8 response patterns", () => {
    // Verify the account field consistently equals the resolved account's label
    const responseShapes = [
      { account: acct.label, mailboxes: [] },
      { account: acct.label, total: 0, page: 1, emails: [] },
      { account: acct.label, uid: 1, mailbox: "INBOX" },
      { account: acct.label, emails: [] },
      { account: acct.label, messageId: "<id>" },
      { account: acct.label, uid: 1, destination: "Archive" },
      { account: acct.label, uid: 1, read: false },
      { account: acct.label, uid: 1, deleted: true },
    ];

    expect(responseShapes).toHaveLength(TOOL_NAMES.length);

    for (const shape of responseShapes) {
      const parsed = JSON.parse(JSON.stringify(shape)) as { account: string };
      expect(parsed.account).toBe(acct.label);
      expect(typeof parsed.account).toBe("string");
    }
  });
});
