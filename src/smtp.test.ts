import { describe, it, expect } from "vitest";
import { smtpConfigFromAccount } from "./smtp.js";
import type { AccountConfig } from "./accounts.js";

const mockAccount: AccountConfig = {
  label: "test",
  emailAddress: "sender@example.com",
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

describe("smtpConfigFromAccount", () => {
  it("ssl mode: secure=true, requireTLS falsy, auth present", () => {
    const config = smtpConfigFromAccount({ ...mockAccount, smtpSecurity: "ssl" });
    expect(config.secure).toBe(true);
    expect(config.requireTLS).toBeFalsy();
    expect(config.auth).toEqual({ user: "testuser", pass: "testpass" });
    expect(config.host).toBe("smtp.example.com");
    expect(config.port).toBe(465);
  });

  it("starttls mode: secure=false, requireTLS=true, auth present", () => {
    const config = smtpConfigFromAccount({ ...mockAccount, smtpSecurity: "starttls" });
    expect(config.secure).toBe(false);
    expect(config.requireTLS).toBe(true);
    expect(config.auth).toBeDefined();
    expect(config.auth?.user).toBe("testuser");
  });

  it("none mode + empty password: no auth property", () => {
    const config = smtpConfigFromAccount({
      ...mockAccount,
      smtpSecurity: "none",
      password: "",
    });
    expect(config.auth).toBeUndefined();
  });

  it("sslVerify=false: tls.rejectUnauthorized=false", () => {
    const config = smtpConfigFromAccount({ ...mockAccount, sslVerify: false });
    expect(config.tls?.rejectUnauthorized).toBe(false);
  });

  it("port mapping: uses smtpPort from account directly", () => {
    const config = smtpConfigFromAccount({ ...mockAccount, smtpPort: 587 });
    expect(config.port).toBe(587);
  });
});
