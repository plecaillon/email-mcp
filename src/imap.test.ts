import { describe, it, expect } from "vitest";
import { imapConfigFromAccount } from "./imap.js";
import type { AccountConfig } from "./accounts.js";

const mockAccount: AccountConfig = {
  label: "test",
  emailAddress: "test@example.com",
  username: "testuser",
  password: "testpass",
  imapHost: "imap.example.com",
  imapPort: 993,
  imapSecurity: "ssl",
  smtpHost: "smtp.example.com",
  smtpPort: 465,
  smtpSecurity: "ssl",
  sslVerify: true,
  sentFolder: "Sent",
};

describe("imapConfigFromAccount", () => {
  it("ssl mode: secure=true, auth present, tls.rejectUnauthorized=true", () => {
    const config = imapConfigFromAccount({ ...mockAccount, imapSecurity: "ssl" });
    expect(config.secure).toBe(true);
    expect(config.auth).toEqual({ user: "testuser", pass: "testpass" });
    expect(config.tls?.rejectUnauthorized).toBe(true);
    expect(config.host).toBe("imap.example.com");
    expect(config.port).toBe(993);
    expect(config.logger).toBe(false);
  });

  it("starttls mode: secure=false, auth present", () => {
    const config = imapConfigFromAccount({ ...mockAccount, imapSecurity: "starttls" });
    expect(config.secure).toBe(false);
    expect(config.auth).toBeDefined();
    expect(config.auth?.user).toBe("testuser");
  });

  it("none mode + empty password: no auth property", () => {
    const config = imapConfigFromAccount({
      ...mockAccount,
      imapSecurity: "none",
      password: "",
    });
    expect(config.auth).toBeUndefined();
  });

  it("none mode + non-empty password: auth present", () => {
    const config = imapConfigFromAccount({
      ...mockAccount,
      imapSecurity: "none",
      password: "somepass",
    });
    expect(config.auth).toBeDefined();
    expect(config.auth?.pass).toBe("somepass");
  });

  it("sslVerify=false: tls.rejectUnauthorized=false", () => {
    const config = imapConfigFromAccount({ ...mockAccount, sslVerify: false });
    expect(config.tls?.rejectUnauthorized).toBe(false);
  });
});
