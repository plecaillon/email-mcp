import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadAccounts, resolveAccount } from "./accounts.js";
import type { AccountConfig } from "./accounts.js";

// Helper: minimal account 1 indexed env vars
function setAccount1Env() {
  vi.stubEnv("ACCOUNT_1_EMAIL_ADDRESS", "indexed@example.com");
  vi.stubEnv("ACCOUNT_1_IMAP_HOST", "imap.indexed.com");
  vi.stubEnv("ACCOUNT_1_SMTP_HOST", "smtp.indexed.com");
  vi.stubEnv("ACCOUNT_1_EMAIL_PASSWORD", "secret1");
}

// Helper: minimal account 2 indexed env vars
function setAccount2Env() {
  vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "second@example.com");
  vi.stubEnv("ACCOUNT_2_IMAP_HOST", "imap.second.com");
  vi.stubEnv("ACCOUNT_2_SMTP_HOST", "smtp.second.com");
  vi.stubEnv("ACCOUNT_2_EMAIL_PASSWORD", "secret2");
}

// Helper: minimal legacy env vars
function setLegacyEnv() {
  vi.stubEnv("EMAIL_ADDRESS", "test@example.com");
  vi.stubEnv("IMAP_HOST", "imap.example.com");
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("EMAIL_PASSWORD", "secret");
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("loadAccounts — legacy mode (CONF-04)", () => {
  it("loads account 1 from legacy env vars when ACCOUNT_1_EMAIL_ADDRESS is absent", () => {
    setLegacyEnv();
    const result = loadAccounts();
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("account1");
    expect(result[0]!.emailAddress).toBe("test@example.com");
    expect(result[0]!.imapHost).toBe("imap.example.com");
    expect(result[0]!.smtpHost).toBe("smtp.example.com");
  });

  it("applies default ports and security when not specified in legacy mode", () => {
    setLegacyEnv();
    const result = loadAccounts();
    expect(result[0]!.imapPort).toBe(993);
    expect(result[0]!.smtpPort).toBe(465);
    expect(result[0]!.imapSecurity).toBe("ssl");
    expect(result[0]!.smtpSecurity).toBe("ssl");
    expect(result[0]!.sslVerify).toBe(true);
    expect(result[0]!.sentFolder).toBe("Sent");
  });

  it("uses EMAIL_USERNAME as username when provided", () => {
    setLegacyEnv();
    vi.stubEnv("EMAIL_USERNAME", "user123");
    const result = loadAccounts();
    expect(result[0]!.username).toBe("user123");
  });

  it("falls back to EMAIL_ADDRESS as username when EMAIL_USERNAME is absent", () => {
    setLegacyEnv();
    const result = loadAccounts();
    expect(result[0]!.username).toBe("test@example.com");
  });
});

describe("loadAccounts — indexed mode (CONF-01)", () => {
  it("loads account 1 from ACCOUNT_1_* when ACCOUNT_1_EMAIL_ADDRESS is present", () => {
    setAccount1Env();
    vi.stubEnv("EMAIL_ADDRESS", "legacy@example.com"); // should be ignored
    const result = loadAccounts();
    expect(result[0]!.emailAddress).toBe("indexed@example.com");
  });

  it("loads two accounts from ACCOUNT_1_* and ACCOUNT_2_*", () => {
    setAccount1Env();
    setAccount2Env();
    const result = loadAccounts();
    expect(result).toHaveLength(2);
    expect(result[0]!.emailAddress).not.toBe(result[1]!.emailAddress);
    expect(result[1]!.label).toBe("account2");
  });
});

describe("loadAccounts — optional accounts (CONF-03)", () => {
  it("skips account 2 when ACCOUNT_2_EMAIL_ADDRESS is empty string", () => {
    setAccount1Env();
    vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "");
    const result = loadAccounts();
    expect(result).toHaveLength(1);
  });

  it("skips account 2 when ACCOUNT_2_EMAIL_ADDRESS is whitespace-only", () => {
    setAccount1Env();
    vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "   ");
    const result = loadAccounts();
    expect(result).toHaveLength(1);
  });

  it("skips account 2 when ACCOUNT_2_EMAIL_ADDRESS is undefined", () => {
    setAccount1Env();
    const result = loadAccounts();
    expect(result).toHaveLength(1);
  });
});

describe("loadAccounts — labels (CONF-02)", () => {
  it("defaults label to 'account1'/'account2' when ACCOUNT_N_LABEL is omitted", () => {
    setAccount1Env();
    setAccount2Env();
    const result = loadAccounts();
    expect(result[0]!.label).toBe("account1");
    expect(result[1]!.label).toBe("account2");
  });

  it("uses custom label when ACCOUNT_N_LABEL is provided", () => {
    setAccount1Env();
    vi.stubEnv("ACCOUNT_1_LABEL", "personal");
    const result = loadAccounts();
    expect(result[0]!.label).toBe("personal");
  });
});

describe("loadAccounts — validation errors", () => {
  it("exits with error naming missing field when account 1 required field is absent", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null | undefined) => {
        throw new Error("process.exit");
      });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ACCOUNT_1_EMAIL_ADDRESS", "test@example.com");
    // ACCOUNT_1_IMAP_HOST intentionally absent

    expect(() => loadAccounts()).toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ACCOUNT_1_IMAP_HOST")
    );
  });

  it("exits with error when account 2 is attempted but has missing required field", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null | undefined) => {
        throw new Error("process.exit");
      });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setAccount1Env();
    vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "test2@example.com");
    // ACCOUNT_2_IMAP_HOST intentionally absent

    expect(() => loadAccounts()).toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ACCOUNT_2_IMAP_HOST")
    );
  });
});

describe("loadAccounts — SecurityMode validation", () => {
  it("exits with error for invalid security mode value", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null | undefined) => {
        throw new Error("process.exit");
      });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setAccount1Env();
    vi.stubEnv("ACCOUNT_1_IMAP_SECURITY", "tls");

    expect(() => loadAccounts()).toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ACCOUNT_1_IMAP_SECURITY")
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ssl, starttls, none")
    );
  });
});

describe("resolveAccount", () => {
  const accounts: AccountConfig[] = [
    {
      label: "account1",
      emailAddress: "a@example.com",
      username: "a",
      password: "p1",
      imapHost: "imap.a.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "smtp.a.com",
      smtpPort: 465,
      smtpSecurity: "ssl",
      sslVerify: true,
      sentFolder: "Sent",
    },
    {
      label: "account2",
      emailAddress: "b@example.com",
      username: "b",
      password: "p2",
      imapHost: "imap.b.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "smtp.b.com",
      smtpPort: 465,
      smtpSecurity: "ssl",
      sslVerify: true,
      sentFolder: "Sent",
    },
  ];

  const personalAccounts: AccountConfig[] = [
    {
      label: "personal",
      emailAddress: "me@personal.com",
      username: "me",
      password: "pass",
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
      username: "me",
      password: "pass",
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

  it("returns account 1 when account is undefined", () => {
    expect(resolveAccount(accounts, undefined)).toBe(accounts[0]);
  });

  it("matches by label case-insensitively", () => {
    expect(resolveAccount(personalAccounts, "Personal")).toBe(
      personalAccounts[0]
    );
    expect(resolveAccount(personalAccounts, "PERSONAL")).toBe(
      personalAccounts[0]
    );
  });

  it("matches by number", () => {
    expect(resolveAccount(accounts, 1)).toBe(accounts[0]);
    expect(resolveAccount(accounts, 2)).toBe(accounts[1]);
  });

  it("throws Error listing valid labels when account is unknown", () => {
    expect(() => resolveAccount(personalAccounts, "unknown")).toThrow(
      /personal/
    );
    expect(() => resolveAccount(personalAccounts, "unknown")).toThrow(/work/);
  });
});
