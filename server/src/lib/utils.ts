import crypto from "node:crypto";
import nodemailer from "nodemailer";

const smtpPort = Number(process.env.SMTP_PORT) || 587;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const sendEmail = async (email: string, code: string) => {
  await transporter.sendMail({
    from: `"PingMe" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Your one time verification code",
    text: `Your one time verification code is ${code}. It expires in 5 minutes.`,
    html: `<p>Your one time verification code is <b>${code}</b>.</p><p>It expires in 5 minutes.</p>`,
  });
};

export function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
