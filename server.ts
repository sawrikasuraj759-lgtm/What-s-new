// Filter transient libsignal Signal session renegotiation noise (auto-recovered by Baileys retry receipts)
const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
  const first = String(args[0] ?? "");
  if (
    first.includes("Failed to decrypt message with any known session") ||
    first.includes("Session error:Error: Bad MAC") ||
    first.includes("Session error: Error: Bad MAC")
  ) {
    return;
  }
  _origConsoleError(...args);
};

process.on('uncaughtException', (err) => {
  console.warn('[SERVER SAFEGUARD] Uncaught Exception:', err && err.message ? err.message : err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[SERVER SAFEGUARD] Unhandled Rejection:', reason && reason.message ? reason.message : reason);
});

import { startServer } from './src/server/appServer';

startServer().catch((err) => {
  console.error('Fatal Server Error:', err);
});
