import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface BusinessPayDevice {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  batteryLevel?: number;
  simOperator?: string;
  lastSeenAt: string;
}

export interface BusinessPayEvent {
  id: string;
  source: 'sms' | 'notification' | 'test';
  bank: string;
  amountLkr: number;
  balanceLkr?: number | null;
  reference: string;
  sender: string;
  appPackage?: string;
  rawMessage: string;
  status: 'matched' | 'unmatched' | 'ignored';
  matchedOrderId?: string;
  matchedCustomer?: string;
  deviceName?: string;
  timestamp: string;
}

export interface BusinessPayOrder {
  id: string;
  customerJid: string;
  customerNumber: string;
  productId: string;
  productName: string;
  packageDays?: string;
  priceDisplay: string;
  amountLkr: number;
  status: 'pending_payment' | 'paid' | 'cancelled';
  matchedRef?: string;
  matchedBank?: string;
  createdAt: string;
  paidAt?: string;
}

export interface BusinessPayConfig {
  enabled: boolean;
  webhookSecret: string;
  autoMatchOrders: boolean;
  notifyOwnerOnPayment: boolean;
  notifyCustomerOnMatch: boolean;
  bankDetailsText: string;
  minAmountLkr: number;
  lkrPerUsdRate: number;
}

export interface BusinessPayStoreState {
  tenantId: string;
  lastServerOrigin?: string;
  config: BusinessPayConfig;
  devices: BusinessPayDevice[];
  events: BusinessPayEvent[];
  orders: BusinessPayOrder[];
  updatedAt: string;
}

const DEFAULT_BANK_DETAILS =
  '🏦 NSB: 100156103618 (A.M.Y.N Alahakoon) • 📱 eZ Cash: 074 386 5934 — ගෙවීම සිදු කළ පසු Payment Receipt එක එවන්න.';

function sanitizeTenantId(userId: string): string {
  const clean = (userId || 'primary__business').replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean || 'primary__business';
}

function getPayFilePath(tenantId: string): string {
  const safeId = sanitizeTenantId(tenantId);
  return path.resolve(process.cwd(), 'data', 'sessions', safeId, 'business_pay.json');
}

export function generatePaySecret(): string {
  return `yhp_${crypto.randomBytes(24).toString('hex')}`;
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Keep a short-term dedup cache to avoid double-recording when Android SMS & Notification fire together
const recentEventFingerprints = new Map<string, number>();

export function getBusinessPayState(tenantId: string): BusinessPayStoreState {
  const safeId = sanitizeTenantId(tenantId);
  const filePath = getPayFilePath(safeId);

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const secret =
        typeof parsed?.config?.webhookSecret === 'string' && parsed.config.webhookSecret.startsWith('yhp_')
          ? parsed.config.webhookSecret
          : generatePaySecret();

      const state: BusinessPayStoreState = {
        tenantId: safeId,
        lastServerOrigin:
          typeof parsed?.lastServerOrigin === 'string' && parsed.lastServerOrigin.startsWith('http')
            ? parsed.lastServerOrigin
            : undefined,
        config: {
          enabled: parsed?.config?.enabled !== false,
          webhookSecret: secret,
          autoMatchOrders: parsed?.config?.autoMatchOrders !== false,
          notifyOwnerOnPayment: parsed?.config?.notifyOwnerOnPayment !== false,
          notifyCustomerOnMatch: parsed?.config?.notifyCustomerOnMatch !== false,
          bankDetailsText:
            typeof parsed?.config?.bankDetailsText === 'string' && parsed.config.bankDetailsText.trim()
              ? parsed.config.bankDetailsText
              : DEFAULT_BANK_DETAILS,
          minAmountLkr:
            Number.isFinite(Number(parsed?.config?.minAmountLkr)) && Number(parsed?.config.minAmountLkr) >= 0
              ? Number(parsed.config.minAmountLkr)
              : 10,
          lkrPerUsdRate:
            Number.isFinite(Number(parsed?.config?.lkrPerUsdRate)) && Number(parsed.config.lkrPerUsdRate) > 0
              ? Number(parsed.config.lkrPerUsdRate)
              : 300,
        },
        devices: Array.isArray(parsed?.devices) ? parsed.devices.slice(0, 10) : [],
        events: Array.isArray(parsed?.events) ? parsed.events.slice(0, 100) : [],
        orders: Array.isArray(parsed?.orders) ? parsed.orders.slice(0, 100) : [],
        updatedAt: parsed?.updatedAt || new Date().toISOString(),
      };
      return state;
    } catch {
      // fall through and create fresh state
    }
  }

  const initial: BusinessPayStoreState = {
    tenantId: safeId,
    config: {
      enabled: true,
      webhookSecret: generatePaySecret(),
      autoMatchOrders: true,
      notifyOwnerOnPayment: true,
      notifyCustomerOnMatch: true,
      bankDetailsText: DEFAULT_BANK_DETAILS,
      minAmountLkr: 10,
      lkrPerUsdRate: 300,
    },
    devices: [],
    events: [],
    orders: [],
    updatedAt: new Date().toISOString(),
  };
  saveBusinessPayState(initial);
  return initial;
}

export function saveBusinessPayState(state: BusinessPayStoreState): BusinessPayStoreState {
  const filePath = getPayFilePath(state.tenantId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized: BusinessPayStoreState = {
    ...state,
    devices: state.devices.slice(0, 10),
    events: state.events.slice(0, 100),
    orders: state.orders.slice(0, 100),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
  return normalized;
}

export function updateBusinessPayConfig(
  tenantId: string,
  updates: Partial<Omit<BusinessPayConfig, 'webhookSecret'>>
): BusinessPayStoreState {
  const state = getBusinessPayState(tenantId);
  if (typeof updates.enabled === 'boolean') state.config.enabled = updates.enabled;
  if (typeof updates.autoMatchOrders === 'boolean') state.config.autoMatchOrders = updates.autoMatchOrders;
  if (typeof updates.notifyOwnerOnPayment === 'boolean') {
    state.config.notifyOwnerOnPayment = updates.notifyOwnerOnPayment;
  }
  if (typeof updates.notifyCustomerOnMatch === 'boolean') {
    state.config.notifyCustomerOnMatch = updates.notifyCustomerOnMatch;
  }
  if (typeof updates.bankDetailsText === 'string') {
    state.config.bankDetailsText = updates.bankDetailsText.slice(0, 1000).trim();
  }
  if (updates.minAmountLkr !== undefined) {
    const n = Number(updates.minAmountLkr);
    if (Number.isFinite(n) && n >= 0 && n <= 10000000) state.config.minAmountLkr = n;
  }
  if (updates.lkrPerUsdRate !== undefined) {
    const n = Number(updates.lkrPerUsdRate);
    if (Number.isFinite(n) && n > 0 && n <= 100000) state.config.lkrPerUsdRate = n;
  }
  return saveBusinessPayState(state);
}

export function rotateBusinessPaySecret(tenantId: string): BusinessPayStoreState {
  const state = getBusinessPayState(tenantId);
  state.config.webhookSecret = generatePaySecret();
  return saveBusinessPayState(state);
}

export function setBusinessPayOrigin(tenantId: string, origin: string): void {
  const clean = String(origin || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(clean)) return;
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean);
  const state = getBusinessPayState(tenantId);
  // Don't overwrite a public HTTPS URL with a localhost ping
  if (isLocal && state.lastServerOrigin && /^https:\/\//i.test(state.lastServerOrigin)) {
    return;
  }
  if (state.lastServerOrigin !== clean) {
    state.lastServerOrigin = clean;
    saveBusinessPayState(state);
  }
}

export function buildBotLinkKey(tenantId: string, overrideOrigin?: string): string {
  const state = getBusinessPayState(tenantId);
  const candidate = String(
    overrideOrigin || state.lastServerOrigin || process.env.APP_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');
  if (/^https?:\/\//i.test(candidate)) {
    const payload = JSON.stringify({
      u: candidate,
      k: state.config.webhookSecret,
    });
    return `YHP.${Buffer.from(payload, 'utf8').toString('base64url')}`;
  }
  return state.config.webhookSecret;
}

/**
 * Resolves the tenant owning a given Pay Webhook secret using constant-time comparison.
 */
export function resolveTenantByPaySecret(secretToken: string, preferredTenant?: string): BusinessPayStoreState | null {
  const cleanSecret = String(secretToken || '').trim();
  if (!cleanSecret || cleanSecret.length < 16) return null;

  if (preferredTenant && typeof preferredTenant === 'string' && preferredTenant.trim()) {
    const candidate = getBusinessPayState(preferredTenant.trim());
    if (timingSafeCompare(cleanSecret, candidate.config.webhookSecret)) {
      return candidate;
    }
  }

  const sessionsDir = path.resolve(process.cwd(), 'data', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;

  let matched: BusinessPayStoreState | null = null;
  const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const payFile = path.join(sessionsDir, entry.name, 'business_pay.json');
    if (!fs.existsSync(payFile)) continue;
    try {
      const state = getBusinessPayState(entry.name);
      if (timingSafeCompare(cleanSecret, state.config.webhookSecret)) {
        matched = state;
      }
    } catch {
      // skip invalid file
    }
  }
  return matched;
}

export function estimateAmountLkr(priceDisplay: string, lkrPerUsdRate = 300): number {
  const raw = String(priceDisplay || '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, '');
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return 0;
  const val = Number(match[0]);
  if (!Number.isFinite(val) || val <= 0) return 0;
  if (/\$|usd/i.test(raw) && !/lkr|rs/i.test(raw)) {
    return Math.max(1, Math.round(val * lkrPerUsdRate));
  }
  return Math.round(val * 100) / 100;
}

export function createBusinessPayOrder(
  tenantId: string,
  input: {
    customerJid: string;
    customerNumber: string;
    productId: string;
    productName: string;
    packageDays?: string;
    priceDisplay: string;
    amountLkr?: number;
  }
): BusinessPayOrder {
  const state = getBusinessPayState(tenantId);
  const amountLkr =
    typeof input.amountLkr === 'number' && Number.isFinite(input.amountLkr) && input.amountLkr > 0
      ? Math.round(input.amountLkr * 100) / 100
      : estimateAmountLkr(input.priceDisplay, state.config.lkrPerUsdRate);

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const order: BusinessPayOrder = {
    id: `YH-${randomSuffix}`,
    customerJid: String(input.customerJid || '').slice(0, 120),
    customerNumber: String(input.customerNumber || '').replace(/[^0-9+]/g, '').slice(0, 24),
    productId: String(input.productId || '').slice(0, 80),
    productName: String(input.productName || 'Business Order').slice(0, 120),
    packageDays: input.packageDays ? String(input.packageDays).slice(0, 60) : undefined,
    priceDisplay: String(input.priceDisplay || `LKR ${amountLkr}`).slice(0, 40),
    amountLkr,
    status: 'pending_payment',
    createdAt: new Date().toISOString(),
  };

  state.orders.unshift(order);
  saveBusinessPayState(state);
  return order;
}

export function updateBusinessPayOrderStatus(
  tenantId: string,
  orderId: string,
  status: BusinessPayOrder['status']
): BusinessPayOrder | null {
  const state = getBusinessPayState(tenantId);
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx === -1) return null;
  state.orders[idx].status = status;
  if (status === 'paid' && !state.orders[idx].paidAt) {
    state.orders[idx].paidAt = new Date().toISOString();
  }
  saveBusinessPayState(state);
  return state.orders[idx];
}

export interface ParsedSriLankaPayment {
  isCredit: boolean;
  isIgnored: boolean;
  bank: string;
  amountLkr: number;
  balanceLkr: number | null;
  reference: string;
}

export function parseSriLankanPaymentMessage(
  rawMessage: string,
  sender = '',
  appPackage = ''
): ParsedSriLankaPayment {
  const safeMsg = String(rawMessage || '').replace(/[\r\n\t]+/g, ' ').trim();
  const combined = `${sender} ${appPackage} ${safeMsg}`;
  const lower = combined.toLowerCase();

  // Ignore OTPs, login alerts, and debits/withdrawals
  if (/\b(otp|one time password|verification code|pin is|passcode)\b/i.test(safeMsg)) {
    return { isCredit: false, isIgnored: true, bank: sender || 'OTP Alert', amountLkr: 0, balanceLkr: null, reference: '' };
  }

  const hasDebitVerb = /\b(debited|withdrawn|spent|paid to|purchase of|sent to|transferred out|dr\.?)\b/i.test(safeMsg);
  const hasCreditVerb = /\b(credited|received|deposited|inward|cr\.?|cash in|transfer from|topup|top-up)\b/i.test(safeMsg);

  if (hasDebitVerb && !hasCreditVerb) {
    return { isCredit: false, isIgnored: true, bank: sender || 'Debit Alert', amountLkr: 0, balanceLkr: null, reference: '' };
  }

  let bank = sender.trim() || 'Bank / Wallet';
  if (/combank|commercial/i.test(combined)) bank = 'Commercial Bank';
  else if (/\bboc\b|bank of ceylon|smartpay/i.test(combined)) bank = 'BOC / SmartPay';
  else if (/sampath|vishwa|wepay/i.test(combined)) bank = 'Sampath Bank';
  else if (/\bhnb\b|hatton|solo/i.test(combined)) bank = 'HNB / SOLO';
  else if (/peoples|people'?s/i.test(combined)) bank = "People's Bank";
  else if (/seylan/i.test(combined)) bank = 'Seylan Bank';
  else if (/frimi|nations/i.test(combined)) bank = 'FriMi / NTB';
  else if (/ndb|neos/i.test(combined)) bank = 'NDB / NEOS';
  else if (/genie|dialog/i.test(combined)) bank = 'Dialog Genie';
  else if (/ez\s*cash|ezcash/i.test(combined)) bank = 'eZ Cash';
  else if (/mcash|mobitel/i.test(combined)) bank = 'mCash';
  else if (/ipay|lolc/i.test(combined)) bank = 'LOLC iPay';
  else if (/dfcc/i.test(combined)) bank = 'DFCC Bank';
  else if (/cargills/i.test(combined)) bank = 'Cargills Bank';
  else if (/pan asia/i.test(combined)) bank = 'Pan Asia Bank';

  let amountLkr = 0;
  const amountPatterns = [
    /(?:credited(?:\s+with)?|received|deposited|amount[:\s]*|cr[:\s]*)\s*(?:LKR|Rs\.?|රු\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:LKR|Rs\.?|රු\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:credited|received|deposited|has been credited)/i,
    /(?:LKR|Rs\.?|රු\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];
  for (const pat of amountPatterns) {
    const m = safeMsg.match(pat);
    if (m && m[1]) {
      const parsed = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) {
        amountLkr = parsed;
        break;
      }
    }
  }

  let balanceLkr: number | null = null;
  const balMatch = safeMsg.match(/(?:avail(?:able)?\s*bal(?:ance)?|bal(?:ance)?)[:\s]*(?:LKR|Rs\.?)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (balMatch && balMatch[1]) {
    const parsedBal = parseFloat(balMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsedBal)) balanceLkr = parsedBal;
  }

  let reference = '';
  const refMatch = safeMsg.match(/(?:YH-\d{3,6}|(?:ref(?:erence)?(?:\s*no\.?)?|trx(?:\s*id)?|txn(?:\s*id)?|rrn|seq)[:\s#-]*([A-Za-z0-9-]{4,24}))/i);
  if (refMatch) {
    reference = (refMatch[1] || refMatch[0]).toUpperCase().trim();
  } else {
    const numId = safeMsg.match(/\b([0-9]{6,14})\b/);
    if (numId?.[1]) reference = numId[1];
  }

  const isCredit = amountLkr > 0 && (hasCreditVerb || /\b(lkr|rs\.?)\b/i.test(lower));
  return {
    isCredit,
    isIgnored: !isCredit,
    bank,
    amountLkr,
    balanceLkr,
    reference: reference || `TX-${Date.now().toString().slice(-6)}`,
  };
}

export function touchPayDevice(
  state: BusinessPayStoreState,
  deviceInfo: {
    deviceId?: string;
    deviceName?: string;
    appVersion?: string;
    batteryLevel?: number;
    simOperator?: string;
  }
) {
  const devId = String(deviceInfo.deviceId || 'yashi-pay-device').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  const nextDevice: BusinessPayDevice = {
    deviceId: devId,
    deviceName: String(deviceInfo.deviceName || 'Android Device').slice(0, 64),
    appVersion: String(deviceInfo.appVersion || '1.0.0').slice(0, 20),
    batteryLevel:
      typeof deviceInfo.batteryLevel === 'number' && Number.isFinite(deviceInfo.batteryLevel)
        ? Math.max(0, Math.min(100, Math.round(deviceInfo.batteryLevel)))
        : undefined,
    simOperator: deviceInfo.simOperator ? String(deviceInfo.simOperator).slice(0, 40) : undefined,
    lastSeenAt: new Date().toISOString(),
  };

  const existingIdx = state.devices.findIndex((d) => d.deviceId === devId);
  if (existingIdx >= 0) {
    state.devices[existingIdx] = nextDevice;
  } else {
    state.devices.unshift(nextDevice);
  }
}

export function ingestPayWebhookEvent(
  state: BusinessPayStoreState,
  payload: {
    source: 'sms' | 'notification' | 'test';
    sender?: string;
    appPackage?: string;
    rawMessage: string;
    amountLkr?: number;
    balanceLkr?: number | null;
    reference?: string;
    deviceId?: string;
    deviceName?: string;
    appVersion?: string;
    batteryLevel?: number;
    simOperator?: string;
  }
): {
  duplicate?: boolean;
  event: BusinessPayEvent;
  matchedOrder?: BusinessPayOrder;
} {
  touchPayDevice(state, payload);

  const cleanRaw = String(payload.rawMessage || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 1000);
  const parsed = parseSriLankanPaymentMessage(cleanRaw, payload.sender || '', payload.appPackage || '');

  const finalAmount =
    typeof payload.amountLkr === 'number' && Number.isFinite(payload.amountLkr) && payload.amountLkr > 0
      ? Math.round(payload.amountLkr * 100) / 100
      : parsed.amountLkr;
  const finalRef = (payload.reference && String(payload.reference).trim().slice(0, 40)) || parsed.reference;

  // Deduplicate identical alerts within 15 seconds (e.g., dual SMS + notification capture)
  const fpKey = `${state.tenantId}:${finalAmount}:${cleanRaw.toLowerCase().slice(0, 120)}`;
  const now = Date.now();
  const prevSeen = recentEventFingerprints.get(fpKey);
  if (payload.source !== 'test' && prevSeen && now - prevSeen < 15000 && state.events[0]) {
    saveBusinessPayState(state);
    return { duplicate: true, event: state.events[0] };
  }
  recentEventFingerprints.set(fpKey, now);
  if (recentEventFingerprints.size > 300) {
    const firstKey = recentEventFingerprints.keys().next().value;
    if (firstKey) recentEventFingerprints.delete(firstKey);
  }

  const belowMinimum = finalAmount < (state.config.minAmountLkr || 0);
  const isIgnored = payload.source !== 'test' && (parsed.isIgnored || finalAmount <= 0 || belowMinimum);

  let matchedOrder: BusinessPayOrder | undefined;
  if (!isIgnored && state.config.autoMatchOrders) {
    // 1. Check explicit YH-xxxx Order ID mention first
    const orderIdMatch = cleanRaw.match(/\bYH-\d{3,6}\b/i);
    if (orderIdMatch) {
      const targetId = orderIdMatch[0].toUpperCase();
      matchedOrder = state.orders.find(
        (o) =>
          o.id === targetId &&
          o.status === 'pending_payment' &&
          (o.amountLkr <= 0 || Math.abs(o.amountLkr - finalAmount) <= 5)
      );
    }
    // 2. Otherwise match newest pending order within last 24h by exact LKR amount (+/- Rs. 1)
    if (!matchedOrder) {
      const cutoff = now - 24 * 60 * 60 * 1000;
      matchedOrder = state.orders.find((o) => {
        if (o.status !== 'pending_payment' || o.amountLkr <= 0) return false;
        const createdMs = new Date(o.createdAt).getTime();
        if (!Number.isFinite(createdMs) || createdMs < cutoff) return false;
        return Math.abs(o.amountLkr - finalAmount) <= 1.01;
      });
    }
  }

  if (matchedOrder) {
    matchedOrder.status = 'paid';
    matchedOrder.paidAt = new Date().toISOString();
    matchedOrder.matchedRef = finalRef;
    matchedOrder.matchedBank = parsed.bank;
  }

  const event: BusinessPayEvent = {
    id: `pay-${now}-${crypto.randomBytes(3).toString('hex')}`,
    source: payload.source,
    bank: parsed.bank,
    amountLkr: finalAmount,
    balanceLkr: payload.balanceLkr ?? parsed.balanceLkr,
    reference: finalRef,
    sender: String(payload.sender || parsed.bank).slice(0, 64),
    appPackage: payload.appPackage ? String(payload.appPackage).slice(0, 120) : undefined,
    rawMessage: cleanRaw,
    status: isIgnored ? 'ignored' : matchedOrder ? 'matched' : 'unmatched',
    matchedOrderId: matchedOrder?.id,
    matchedCustomer: matchedOrder?.customerNumber,
    deviceName: payload.deviceName ? String(payload.deviceName).slice(0, 64) : undefined,
    timestamp: new Date().toISOString(),
  };

  if (!isIgnored || payload.source === 'test') {
    state.events.unshift(event);
  }
  saveBusinessPayState(state);

  return { event, matchedOrder };
}

export function getApkBinaryPath(): string {
  return path.resolve(process.cwd(), 'data', 'apk', 'YashiHallsPay-v1.0.0.apk');
}

export function getApkBinaryInfo() {
  const apkPath = getApkBinaryPath();
  if (!fs.existsSync(apkPath)) {
    return {
      available: false,
      filename: 'YashiHallsPay.apk',
      version: '2.0.0',
      packageName: 'com.yashihalls.pay',
      sizeBytes: 0,
      sha256: '',
    };
  }
  const stat = fs.statSync(apkPath);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex');
  return {
    available: true,
    filename: 'YashiHallsPay.apk',
    version: '2.0.0',
    packageName: 'com.yashihalls.pay',
    sizeBytes: stat.size,
    sha256: hash,
  };
}
