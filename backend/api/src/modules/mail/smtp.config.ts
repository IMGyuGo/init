import nodemailer from "nodemailer";

import type { MailTransport } from "./mail.types";

export const SMTP_CONFIG = Symbol("SMTP_CONFIG");
export const SMTP_TRANSPORT = Symbol("SMTP_TRANSPORT");

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user?: string;
  pass?: string;
  from: string;
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  socketTimeoutMs: number;
  smokeTo?: string;
};

export function loadSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const production = env.NODE_ENV === "production";
  const host = normalized(env.SMTP_HOST) ?? (production ? "" : "localhost");
  const port = positiveInteger("SMTP_PORT", env.SMTP_PORT ?? "1025", 65_535);
  const secure = booleanValue("SMTP_SECURE", env.SMTP_SECURE, false);
  const requireTLS = booleanValue("SMTP_REQUIRE_TLS", env.SMTP_REQUIRE_TLS, production);
  const user = normalized(env.SMTP_USER);
  const pass = normalized(env.SMTP_PASS);
  const from = normalized(env.SMTP_FROM) ?? (production ? "" : "no-reply@init.local");
  const smokeTo = normalized(env.SMTP_SMOKE_TO);

  if (!host) throw new Error("SMTP_HOST is required in production");
  if (!from || !isEmail(from)) throw new Error("SMTP_FROM must be a valid email address");
  if (smokeTo && !isEmail(smokeTo)) throw new Error("SMTP_SMOKE_TO must be a valid email address");
  if (Boolean(user) !== Boolean(pass)) throw new Error("SMTP_USER and SMTP_PASS must be configured together");
  if (production && (!user || !pass)) throw new Error("SMTP_USER and SMTP_PASS are required in production");
  if (production && !secure && !requireTLS) {
    throw new Error("Production SMTP must use implicit TLS or require STARTTLS");
  }

  return {
    host,
    port,
    secure,
    requireTLS,
    user,
    pass,
    from,
    connectionTimeoutMs: positiveInteger(
      "SMTP_CONNECTION_TIMEOUT_MS",
      env.SMTP_CONNECTION_TIMEOUT_MS ?? "10000",
      600_000,
    ),
    greetingTimeoutMs: positiveInteger(
      "SMTP_GREETING_TIMEOUT_MS",
      env.SMTP_GREETING_TIMEOUT_MS ?? "10000",
      600_000,
    ),
    socketTimeoutMs: positiveInteger(
      "SMTP_SOCKET_TIMEOUT_MS",
      env.SMTP_SOCKET_TIMEOUT_MS ?? "20000",
      600_000,
    ),
    smokeTo,
  };
}

export function createSmtpTransport(config: SmtpConfig): MailTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: config.connectionTimeoutMs,
    greetingTimeout: config.greetingTimeoutMs,
    socketTimeout: config.socketTimeoutMs,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  }) as MailTransport;
}

function normalized(value: string | undefined) {
  const result = value?.trim();
  return result ? result : undefined;
}

function booleanValue(name: string, value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function positiveInteger(name: string, value: string, max: number) {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(`${name} must be between 1 and ${max}`);
  }
  return parsed;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
