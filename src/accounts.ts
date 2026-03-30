export type SecurityMode = "ssl" | "starttls" | "none";

export interface AccountConfig {
  label: string;
  emailAddress: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityMode;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityMode;
  sslVerify: boolean;
  sentFolder: string;
}

const SECURITY_MODES = ["ssl", "starttls", "none"] as const;

function readStr(key: string): string {
  return process.env[key] ?? "";
}

function isPresent(value: string): boolean {
  return value.trim().length > 0;
}

function requireStr(value: string, varName: string): string {
  if (!isPresent(value)) {
    console.error(`${varName} is required`);
    process.exit(1);
  }
  return value.trim();
}

function parseSecurityMode(value: string, varName: string): SecurityMode {
  if (!isPresent(value)) return "ssl";
  const normalized = value.toLowerCase().trim();
  if (!SECURITY_MODES.includes(normalized as SecurityMode)) {
    console.error(`${varName} must be one of: ssl, starttls, none`);
    process.exit(1);
  }
  return normalized as SecurityMode;
}

function parsePort(value: string, defaultPort: number): number {
  if (!isPresent(value)) return defaultPort;
  const parsed = parseInt(value.trim(), 10);
  if (isNaN(parsed)) return defaultPort;
  return parsed;
}

function loadIndexedAccount(n: number): AccountConfig {
  const emailAddress = requireStr(
    readStr(`ACCOUNT_${n}_EMAIL_ADDRESS`),
    `ACCOUNT_${n}_EMAIL_ADDRESS`
  );
  const imapHost = requireStr(
    readStr(`ACCOUNT_${n}_IMAP_HOST`),
    `ACCOUNT_${n}_IMAP_HOST`
  );
  const smtpHost = requireStr(
    readStr(`ACCOUNT_${n}_SMTP_HOST`),
    `ACCOUNT_${n}_SMTP_HOST`
  );
  const password = readStr(`ACCOUNT_${n}_EMAIL_PASSWORD`).trim();

  const imapSecurity = parseSecurityMode(
    readStr(`ACCOUNT_${n}_IMAP_SECURITY`),
    `ACCOUNT_${n}_IMAP_SECURITY`
  );
  const smtpSecurity = parseSecurityMode(
    readStr(`ACCOUNT_${n}_SMTP_SECURITY`),
    `ACCOUNT_${n}_SMTP_SECURITY`
  );

  if (!isPresent(password) && (imapSecurity !== "none" || smtpSecurity !== "none")) {
    console.error(`ACCOUNT_${n}_EMAIL_PASSWORD is required when security is not "none"`);
    process.exit(1);
  }

  const rawUsername = readStr(`ACCOUNT_${n}_EMAIL_USERNAME`);
  const username = isPresent(rawUsername) ? rawUsername.trim() : emailAddress;

  const rawLabel = readStr(`ACCOUNT_${n}_LABEL`);
  const label = isPresent(rawLabel) ? rawLabel.trim() : `account${n}`;

  const defaultImapPort = imapSecurity === "ssl" ? 993 : 143;
  const imapPort = parsePort(
    readStr(`ACCOUNT_${n}_IMAP_PORT`),
    defaultImapPort
  );

  const defaultSmtpPort =
    smtpSecurity === "ssl" ? 465 : smtpSecurity === "starttls" ? 587 : 25;
  const smtpPort = parsePort(
    readStr(`ACCOUNT_${n}_SMTP_PORT`),
    defaultSmtpPort
  );

  const sslVerify = readStr(`ACCOUNT_${n}_SSL_VERIFY`) !== "false";

  const rawSentFolder = readStr(`ACCOUNT_${n}_SENT_FOLDER`);
  const sentFolder = isPresent(rawSentFolder) ? rawSentFolder.trim() : "Sent";

  return {
    label,
    emailAddress,
    username,
    password,
    imapHost,
    imapPort,
    imapSecurity,
    smtpHost,
    smtpPort,
    smtpSecurity,
    sslVerify,
    sentFolder,
  };
}

function loadLegacyAccount(): AccountConfig {
  const emailAddress = requireStr(readStr("EMAIL_ADDRESS"), "EMAIL_ADDRESS");
  const imapHost = requireStr(readStr("IMAP_HOST"), "IMAP_HOST");
  const smtpHost = requireStr(readStr("SMTP_HOST"), "SMTP_HOST");
  const password = readStr("EMAIL_PASSWORD").trim();

  const rawUsername = readStr("EMAIL_USERNAME");
  const username = isPresent(rawUsername) ? rawUsername.trim() : emailAddress;

  const imapSecurity = parseSecurityMode(readStr("IMAP_SECURITY"), "IMAP_SECURITY");
  const smtpSecurity = parseSecurityMode(readStr("SMTP_SECURITY"), "SMTP_SECURITY");

  const defaultImapPort = imapSecurity === "ssl" ? 993 : 143;
  const imapPort = parsePort(readStr("IMAP_PORT"), defaultImapPort);

  const defaultSmtpPort =
    smtpSecurity === "ssl" ? 465 : smtpSecurity === "starttls" ? 587 : 25;
  const smtpPort = parsePort(readStr("SMTP_PORT"), defaultSmtpPort);

  const sslVerify = readStr("SSL_VERIFY") !== "false";

  const rawSentFolder = readStr("SENT_FOLDER");
  const sentFolder = isPresent(rawSentFolder) ? rawSentFolder.trim() : "Sent";

  return {
    label: "account1",
    emailAddress,
    username,
    password,
    imapHost,
    imapPort,
    imapSecurity,
    smtpHost,
    smtpPort,
    smtpSecurity,
    sslVerify,
    sentFolder,
  };
}

export function loadAccounts(): AccountConfig[] {
  const useIndexed = isPresent(readStr("ACCOUNT_1_EMAIL_ADDRESS"));
  const account1 = useIndexed ? loadIndexedAccount(1) : loadLegacyAccount();
  const accounts: AccountConfig[] = [account1];

  for (const n of [2, 3] as const) {
    const sentinel = readStr(`ACCOUNT_${n}_EMAIL_ADDRESS`);
    if (isPresent(sentinel)) {
      accounts.push(loadIndexedAccount(n));
    }
  }

  return accounts;
}

export function resolveAccount(
  accounts: AccountConfig[],
  account: string | number | undefined
): AccountConfig {
  if (account === undefined) {
    return accounts[0]!;
  }

  const match =
    typeof account === "number"
      ? accounts[account - 1]
      : accounts.find(
          (a) => a.label.toLowerCase() === account.toLowerCase()
        );

  if (!match) {
    const valid = accounts.map((a) => `"${a.label}"`).join(", ");
    throw new Error(`Unknown account "${account}". Valid accounts: ${valid}`);
  }

  return match;
}
