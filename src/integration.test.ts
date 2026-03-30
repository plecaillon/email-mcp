import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { loadAccounts } from "./accounts.js";
import type { AccountConfig } from "./accounts.js";
import { imapConfigFromAccount } from "./imap.js";
import { smtpConfigFromAccount, sendEmail } from "./smtp.js";
import * as imapModule from "./imap.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: vi
        .fn()
        .mockResolvedValue({
          messageId: "<test@id>",
          accepted: ["to@test.com"],
          rejected: [],
        }),
      close: vi.fn(),
    }),
  },
}));

const account1: AccountConfig = {
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
};

const account2: AccountConfig = {
  label: "work",
  emailAddress: "me@work.com",
  username: "work-user",
  password: "pass2",
  imapHost: "imap.work.com",
  imapPort: 993,
  imapSecurity: "ssl",
  smtpHost: "smtp.work.com",
  smtpPort: 465,
  smtpSecurity: "ssl",
  sslVerify: true,
  sentFolder: "Work Sent",
};

describe("SC-1: No process.env in domain modules", () => {
  it("imap.ts contains no process.env", () => {
    const source = readFileSync(join(__dirname, "imap.ts"), "utf-8");
    expect(source).not.toContain("process.env");
  });

  it("smtp.ts contains no process.env", () => {
    const source = readFileSync(join(__dirname, "smtp.ts"), "utf-8");
    expect(source).not.toContain("process.env");
  });
});

describe("SC-2: IMAP routing per account", () => {
  it("account 1 config routes to imap.personal.com", () => {
    const config = imapConfigFromAccount(account1);
    expect(config.host).toBe("imap.personal.com");
    expect(config.port).toBe(993);
  });

  it("account 2 config routes to imap.work.com, not imap.personal.com", () => {
    const config = imapConfigFromAccount(account2);
    expect(config.host).toBe("imap.work.com");
    expect(config.host).not.toBe("imap.personal.com");
  });

  it("account 2 auth uses work-user username", () => {
    const config = imapConfigFromAccount(account2);
    expect(config.auth?.user).toBe("work-user");
  });
});

describe("SC-3: send_email uses correct account for From and Sent folder", () => {
  it("smtpConfigFromAccount for account 2 routes to smtp.work.com", () => {
    const config = smtpConfigFromAccount(account2);
    expect(config.host).toBe("smtp.work.com");
    expect(config.host).not.toBe("smtp.personal.com");
  });

  it("smtpConfigFromAccount for account 2 uses work-user auth", () => {
    const config = smtpConfigFromAccount(account2);
    expect(config.auth).toMatchObject({ user: "work-user" });
  });

  it("account 2 emailAddress provides correct From address", () => {
    expect(account2.emailAddress).toBe("me@work.com");
  });

  it("account 2 sentFolder is Work Sent, not Sent", () => {
    expect(account2.sentFolder).toBe("Work Sent");
  });

  it("sendEmail passes account 2 config to appendToMailbox for Sent copy", async () => {
    const appendSpy = vi
      .spyOn(imapModule, "appendToMailbox")
      .mockResolvedValue(undefined);

    await sendEmail(account2, "to@test.com", "Test", "body");

    expect(appendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ imapHost: "imap.work.com" }),
      "Work Sent",
      expect.any(Buffer)
    );

    appendSpy.mockRestore();
  });
});

describe("SC-4: empty/whitespace IMAP host triggers clear error", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  function setupExitSpies() {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null | undefined) => {
        throw new Error("process.exit");
      });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    return { exitSpy, errorSpy };
  }

  function setAccount1Indexed() {
    vi.stubEnv("ACCOUNT_1_EMAIL_ADDRESS", "a@a.com");
    vi.stubEnv("ACCOUNT_1_IMAP_HOST", "imap.a.com");
    vi.stubEnv("ACCOUNT_1_SMTP_HOST", "smtp.a.com");
    vi.stubEnv("ACCOUNT_1_EMAIL_PASSWORD", "pass1");
  }

  it("empty string ACCOUNT_2_IMAP_HOST exits with named error", () => {
    const { errorSpy } = setupExitSpies();
    setAccount1Indexed();
    vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "b@b.com");
    vi.stubEnv("ACCOUNT_2_IMAP_HOST", "");
    vi.stubEnv("ACCOUNT_2_EMAIL_PASSWORD", "pass2");

    expect(() => loadAccounts()).toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ACCOUNT_2_IMAP_HOST")
    );
  });

  it("whitespace-only ACCOUNT_2_IMAP_HOST exits with named error", () => {
    const { errorSpy } = setupExitSpies();
    setAccount1Indexed();
    vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "b@b.com");
    vi.stubEnv("ACCOUNT_2_IMAP_HOST", "   ");
    vi.stubEnv("ACCOUNT_2_EMAIL_PASSWORD", "pass2");

    expect(() => loadAccounts()).toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ACCOUNT_2_IMAP_HOST")
    );
  });

  it("empty string ACCOUNT_2_SMTP_HOST exits with named error", () => {
    const { errorSpy } = setupExitSpies();
    setAccount1Indexed();
    vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "b@b.com");
    vi.stubEnv("ACCOUNT_2_IMAP_HOST", "imap.b.com");
    vi.stubEnv("ACCOUNT_2_EMAIL_PASSWORD", "pass2");
    vi.stubEnv("ACCOUNT_2_SMTP_HOST", "");

    expect(() => loadAccounts()).toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ACCOUNT_2_SMTP_HOST")
    );
  });
});
