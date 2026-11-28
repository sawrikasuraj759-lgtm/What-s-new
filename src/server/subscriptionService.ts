import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { adminStore } from './adminStore';
import { getBotEngine } from './botEngine';

export type SubscriptionPlanId = 'mini' | 'pro' | 'business';
export type PaidPackageId = 'pro' | 'business';
export type PackageStatus = 'FREE' | 'ACTIVE' | 'EXPIRED';
export type PaymentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface BankDetailsConfig {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchName: string;
  swiftOrCode?: string;
  instructions: string;
}

export interface PackagePricesLkr {
  mini: number;
  pro: number;
  business: number;
}

export interface UserSubscriptionRecord {
  userId: string;
  email: string;
  username: string;
  plan: SubscriptionPlanId;
  status: PackageStatus;
  activatedAt: string | null;
  expiresAt: string | null;
  downgradedAt?: string | null;
  paymentReference: string | null;
  paymentRequestId: string | null;
  remindedMilestones: number[];
  updatedAt: string;
}

export interface ManualPaymentRequest {
  id: string;
  orderRef: string;
  userId: string;
  customerEmail: string;
  customerName: string;
  packageId: PaidPackageId;
  expectedAmountLkr: number;
  transactionReference: string;
  normalizedTransactionRef: string;
  paymentDate: string;
  receiptFileName: string;
  receiptMimeType: string;
  receiptSizeBytes: number;
  receiptSha256: string;
  notes?: string;
  status: PaymentRequestStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  activatedUntil?: string | null;
}

export interface SubscriptionNotificationItem {
  id: string;
  userId: string;
  email: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  createdAt: string;
  read: boolean;
}

interface SubscriptionsDbSchema {
  bankDetails: BankDetailsConfig;
  packagePricesLkr: PackagePricesLkr;
  subscriptions: Record<string, UserSubscriptionRecord>;
  paymentRequests: ManualPaymentRequest[];
  notifications: SubscriptionNotificationItem[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'subscriptions_db.json');
const RECEIPTS_DIR = path.resolve(DATA_DIR, 'subscription_receipts');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_BANK_DETAILS: BankDetailsConfig = {
  bankName: 'NSB (National Savings Bank)',
  accountName: 'A.M.Y.N Alahakoon',
  accountNumber: '100156103618',
  branchName: 'eZ Cash: 074 386 5934',
  swiftOrCode: '',
  instructions:
    'NSB (100156103618 - A.M.Y.N Alahakoon) හෝ Dialog eZ Cash (074 386 5934) වෙත නිවැරදි මුදල ගෙවා Payment Reference අංකය සමඟ Receipt (Screenshot / Photo) එක Upload කරන්න.',
};

const DEFAULT_PRICES: PackagePricesLkr = {
  mini: 0,
  pro: 500,
  business: 1000,
};

function createEmptyDb(): SubscriptionsDbSchema {
  return {
    bankDetails: { ...DEFAULT_BANK_DETAILS },
    packagePricesLkr: { ...DEFAULT_PRICES },
    subscriptions: {},
    paymentRequests: [],
    notifications: [],
  };
}

function normalizeEmail(email?: string): string {
  return String(email || '').trim().toLowerCase();
}

function normalizeUserIdKey(userId?: string, email?: string): string {
  const cleanId = String(userId || '').trim();
  if (cleanId && cleanId !== 'guest' && cleanId !== 'primary' && cleanId !== 'undefined' && cleanId !== 'null') {
    return cleanId;
  }
  const cleanEmail = normalizeEmail(email);
  if (cleanEmail) {
    return `user_${cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }
  return 'guest';
}

function normalizeTransactionRef(ref: string): string {
  return String(ref || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function detectImageType(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

class SubscriptionService {
  private db: SubscriptionsDbSchema;

  constructor() {
    this.ensureDirs();
    this.db = this.loadDb();
  }

  private ensureDirs() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(RECEIPTS_DIR)) {
      fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
    }
  }

  private loadDb(): SubscriptionsDbSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const parsedBank = parsed.bankDetails || {};
        const isLegacyPlaceholder =
          !parsedBank.accountNumber ||
          parsedBank.accountNumber === '8001234567' ||
          parsedBank.accountNumber === '0000000000' ||
          parsedBank.bankName === 'Commercial Bank of Ceylon' ||
          parsedBank.accountName === 'YASHI HALLS Cloud Holdings';
        return {
          bankDetails: isLegacyPlaceholder
            ? { ...DEFAULT_BANK_DETAILS }
            : { ...DEFAULT_BANK_DETAILS, ...parsedBank },
          packagePricesLkr: {
            mini: 0,
            pro: Number(parsed?.packagePricesLkr?.pro) > 0 ? Number(parsed.packagePricesLkr.pro) : 500,
            business: Number(parsed?.packagePricesLkr?.business) > 0 ? Number(parsed.packagePricesLkr.business) : 1000,
          },
          subscriptions: parsed.subscriptions || {},
          paymentRequests: Array.isArray(parsed.paymentRequests) ? parsed.paymentRequests : [],
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        };
      }
    } catch (err) {
      console.error('[SubscriptionService] Failed loading DB, initializing fresh:', err);
    }
    const fresh = createEmptyDb();
    this.saveDb(fresh);
    return fresh;
  }

  private saveDb(nextDb?: SubscriptionsDbSchema) {
    const target = nextDb || this.db;
    try {
      this.ensureDirs();
      fs.writeFileSync(DB_FILE, JSON.stringify(target, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SubscriptionService] Failed saving DB:', err);
    }
  }

  private pushNotification(item: Omit<SubscriptionNotificationItem, 'id' | 'createdAt' | 'read'>) {
    const notif: SubscriptionNotificationItem = {
      ...item,
      id: `subnotif-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    this.db.notifications.unshift(notif);
    if (this.db.notifications.length > 500) {
      this.db.notifications = this.db.notifications.slice(0, 500);
    }
  }

  private findRecord(userId?: string, email?: string): UserSubscriptionRecord | null {
    const cleanEmail = normalizeEmail(email);
    const key = normalizeUserIdKey(userId, cleanEmail);
    if (this.db.subscriptions[key]) {
      return this.db.subscriptions[key];
    }
    if (cleanEmail) {
      for (const rec of Object.values(this.db.subscriptions)) {
        if (normalizeEmail(rec.email) === cleanEmail) {
          return rec;
        }
      }
    }
    return null;
  }

  private ensureRecord(userId: string, email: string, username?: string): UserSubscriptionRecord {
    const existing = this.findRecord(userId, email);
    const cleanEmail = normalizeEmail(email);
    const key = normalizeUserIdKey(userId, cleanEmail);
    if (existing) {
      let changed = false;
      if (cleanEmail && existing.email !== cleanEmail) {
        existing.email = cleanEmail;
        changed = true;
      }
      if (username && username.trim() && existing.username !== username.trim()) {
        existing.username = username.trim();
        changed = true;
      }
      if (changed) {
        existing.updatedAt = new Date().toISOString();
        this.saveDb();
      }
      return existing;
    }

    const record: UserSubscriptionRecord = {
      userId: key,
      email: cleanEmail,
      username: username?.trim() || (cleanEmail ? cleanEmail.split('@')[0] : 'Customer'),
      plan: 'mini',
      status: 'FREE',
      activatedAt: null,
      expiresAt: null,
      downgradedAt: null,
      paymentReference: null,
      paymentRequestId: null,
      remindedMilestones: [],
      updatedAt: new Date().toISOString(),
    };
    this.db.subscriptions[key] = record;
    this.saveDb();
    return record;
  }

  private syncBotTierForUser(userId: string, plan: SubscriptionPlanId) {
    try {
      const safeId = normalizeUserIdKey(userId);
      const engine = getBotEngine(safeId);
      if (engine && engine.state?.config?.plan !== plan) {
        engine.setPlan(plan);
        engine.saveConfigToFile();
      }
      if (plan === 'business') {
        const bizEngine = getBotEngine(`${safeId}__business`);
        if (bizEngine && bizEngine.state?.config?.plan !== 'business') {
          bizEngine.setPlan('business');
          bizEngine.saveConfigToFile();
        }
      } else {
        const bizEngine = getBotEngine(`${safeId}__business`);
        if (bizEngine && bizEngine.state?.config?.plan === 'business' && plan === 'mini') {
          // Downgrade non-admin expired business tenant engine safely
          bizEngine.setPlan('mini');
          bizEngine.saveConfigToFile();
        }
      }
    } catch (err) {
      console.warn('[SubscriptionService] syncBotTier warning:', err);
    }
  }

  private evaluateSingleRecord(rec: UserSubscriptionRecord): boolean {
    let dirty = false;
    const nowMs = Date.now();

    if (rec.plan !== 'mini' && rec.expiresAt) {
      const expMs = Date.parse(rec.expiresAt);
      if (!Number.isNaN(expMs) && expMs <= nowMs) {
        const oldPlan = rec.plan;
        rec.plan = 'mini';
        rec.status = 'EXPIRED';
        rec.downgradedAt = new Date(nowMs).toISOString();
        rec.updatedAt = new Date(nowMs).toISOString();
        dirty = true;

        this.pushNotification({
          userId: rec.userId,
          email: rec.email,
          title: `${oldPlan.toUpperCase()} Subscription Expired`,
          message: `Your 30-day ${oldPlan.toUpperCase()} subscription has expired. Your account was automatically downgraded to MINI (Free). Renew anytime to restore access.`,
          type: 'warning',
        });

        try {
          const cust = adminStore.getCustomer(rec.userId) || adminStore.getCustomer(rec.email);
          if (cust) {
            cust.plan = 'mini';
            cust.planExpiresAt = rec.expiresAt;
            adminStore.saveDatabase(adminStore.db);
          }
          adminStore.addAuditLog(
            'system',
            'SUBSCRIPTION_EXPIRED_DOWNGRADE',
            `Auto-downgraded ${rec.email} from ${oldPlan.toUpperCase()} to MINI after expiry (${rec.expiresAt})`,
            rec.userId
          );
        } catch {}

        this.syncBotTierForUser(rec.userId, 'mini');
      } else if (!Number.isNaN(expMs) && expMs > nowMs) {
        const daysRemaining = Math.ceil((expMs - nowMs) / DAY_MS);
        const milestones = [7, 3, 1];
        for (const m of milestones) {
          if (daysRemaining <= m && !rec.remindedMilestones.includes(m)) {
            rec.remindedMilestones.push(m);
            rec.updatedAt = new Date(nowMs).toISOString();
            dirty = true;
            this.pushNotification({
              userId: rec.userId,
              email: rec.email,
              title: `Renewal Reminder: ${daysRemaining} ${daysRemaining === 1 ? 'Day' : 'Days'} Left`,
              message: `Your YASHI HALLS ${rec.plan.toUpperCase()} subscription expires on ${new Date(expMs).toLocaleDateString()}. Submit a renewal payment before expiry to avoid automatic downgrade to MINI.`,
              type: 'warning',
            });
          }
        }
      }
    }

    return dirty;
  }

  public runExpiryAndReminderSweep(): { checked: number; updated: number } {
    let updated = 0;
    const records = Object.values(this.db.subscriptions);
    for (const rec of records) {
      if (this.evaluateSingleRecord(rec)) {
        updated++;
      }
    }
    if (updated > 0) {
      this.saveDb();
    }
    return { checked: records.length, updated };
  }

  public formatSubscriptionSummary(rec: UserSubscriptionRecord) {
    const nowMs = Date.now();
    const expMs = rec.expiresAt ? Date.parse(rec.expiresAt) : NaN;
    const hasValidPaid =
      rec.plan !== 'mini' &&
      rec.status === 'ACTIVE' &&
      !Number.isNaN(expMs) &&
      expMs > nowMs;

    const remainingMs = hasValidPaid ? Math.max(0, expMs - nowMs) : 0;
    const daysRemaining = hasValidPaid ? Math.ceil(remainingMs / DAY_MS) : 0;
    const hoursRemaining = hasValidPaid ? Math.ceil(remainingMs / (60 * 60 * 1000)) : 0;

    return {
      userId: rec.userId,
      email: rec.email,
      username: rec.username,
      plan: hasValidPaid ? rec.plan : 'mini',
      status: hasValidPaid ? 'ACTIVE' : rec.status === 'EXPIRED' ? 'EXPIRED' : 'FREE',
      activatedAt: rec.activatedAt,
      expiresAt: rec.expiresAt,
      downgradedAt: rec.downgradedAt || null,
      paymentReference: rec.paymentReference,
      paymentRequestId: rec.paymentRequestId,
      daysRemaining,
      hoursRemaining,
      isExpiringSoon: hasValidPaid && daysRemaining <= 5,
      renewalReminderMessage:
        hasValidPaid && daysRemaining <= 7
          ? `Your ${rec.plan.toUpperCase()} plan expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}. Renew now to keep uninterrupted access.`
          : null,
    };
  }

  public getPublicBillingConfig() {
    return {
      bankDetails: { ...this.db.bankDetails },
      packagePricesLkr: { ...this.db.packagePricesLkr },
      packages: [
        {
          id: 'mini' as const,
          name: 'MINI',
          priceLkr: 0,
          durationLabel: 'Free Forever',
          slots: 1,
          tagline: 'Starter dashboard & essential WhatsApp bot controls',
        },
        {
          id: 'pro' as const,
          name: 'PRO',
          priceLkr: this.db.packagePricesLkr.pro,
          durationLabel: '30 Days',
          slots: 5,
          tagline: 'Futuristic neon cyan & purple workspace with full automation',
        },
        {
          id: 'business' as const,
          name: 'BUSINESS',
          priceLkr: this.db.packagePricesLkr.business,
          durationLabel: '30 Days',
          slots: 25,
          tagline: 'Executive luxury black & gold management hub, Store, Pay APK & Glory Bot',
        },
      ],
    };
  }

  public getUserSubscriptionView(userId: string, email: string, username?: string) {
    const rec = this.ensureRecord(userId, email, username);
    if (this.evaluateSingleRecord(rec)) {
      this.saveDb();
    }
    const cleanEmail = normalizeEmail(email);
    const userRequests = this.db.paymentRequests
      .filter(
        (r) =>
          r.userId === rec.userId ||
          (cleanEmail && normalizeEmail(r.customerEmail) === cleanEmail)
      )
      .map((r) => ({
        ...r,
        receiptUrl: `/api/subscriptions/receipts/${encodeURIComponent(r.receiptFileName)}`,
      }));

    const userNotifications = this.db.notifications
      .filter(
        (n) =>
          n.userId === rec.userId ||
          (cleanEmail && normalizeEmail(n.email) === cleanEmail)
      )
      .slice(0, 20);

    return {
      subscription: this.formatSubscriptionSummary(rec),
      requests: userRequests,
      notifications: userNotifications,
      billingConfig: this.getPublicBillingConfig(),
    };
  }

  public getEffectiveTier(userId: string, email?: string, isAdmin = false): SubscriptionPlanId {
    if (isAdmin) {
      const rec = this.findRecord(userId, email);
      if (rec && rec.status === 'ACTIVE' && rec.plan !== 'mini') {
        if (this.evaluateSingleRecord(rec)) this.saveDb();
        return rec.plan;
      }
      return 'business';
    }
    const rec = this.findRecord(userId, email);
    if (!rec) return 'mini';
    if (this.evaluateSingleRecord(rec)) {
      this.saveDb();
    }
    return this.formatSubscriptionSummary(rec).plan;
  }

  public markNotificationRead(userId: string, email: string, notifId: string) {
    const cleanEmail = normalizeEmail(email);
    const target = this.db.notifications.find(
      (n) =>
        n.id === notifId &&
        (n.userId === userId || (cleanEmail && normalizeEmail(n.email) === cleanEmail))
    );
    if (target) {
      target.read = true;
      this.saveDb();
    }
    return Boolean(target);
  }

  public submitManualPayment(params: {
    userId: string;
    email: string;
    username: string;
    packageId: string;
    transactionReference: string;
    paymentDate: string;
    receiptBase64: string;
    notes?: string;
  }): { statusCode: number; success: boolean; message: string; request?: any } {
    const pkg = String(params.packageId || '').trim().toLowerCase();
    if (pkg !== 'pro' && pkg !== 'business') {
      return {
        statusCode: 400,
        success: false,
        message: 'Invalid package selected. Choose PRO or BUSINESS.',
      };
    }

    const cleanEmail = normalizeEmail(params.email);
    if (!cleanEmail) {
      return { statusCode: 400, success: false, message: 'Authenticated account email is required.' };
    }

    const txRef = String(params.transactionReference || '').trim();
    const normTxRef = normalizeTransactionRef(txRef);
    if (txRef.length < 4 || txRef.length > 80 || normTxRef.length < 4) {
      return {
        statusCode: 400,
        success: false,
        message: 'Enter a valid bank transaction reference (4–80 characters).',
      };
    }

    const cleanDate = String(params.paymentDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return {
        statusCode: 400,
        success: false,
        message: 'Select a valid payment date (YYYY-MM-DD).',
      };
    }

    const rawBase64 = String(params.receiptBase64 || '').trim();
    if (!rawBase64) {
      return {
        statusCode: 400,
        success: false,
        message: 'Payment receipt screenshot image is required.',
      };
    }

    const cleanBase64 = rawBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length < 512) {
      return {
        statusCode: 400,
        success: false,
        message: 'Uploaded receipt image appears corrupted or too small.',
      };
    }
    if (buffer.length > 5 * 1024 * 1024) {
      return {
        statusCode: 400,
        success: false,
        message: 'Receipt screenshot must be 5 MB or smaller.',
      };
    }

    const imgType = detectImageType(buffer);
    if (!imgType) {
      return {
        statusCode: 400,
        success: false,
        message: 'Invalid image format. Upload a PNG, JPG, or WEBP screenshot.',
      };
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Anti-duplicate guard: reject identical receipt image OR identical transaction reference
    const dupHash = this.db.paymentRequests.find(
      (r) => r.receiptSha256 === sha256 && (r.status === 'PENDING' || r.status === 'APPROVED')
    );
    if (dupHash) {
      return {
        statusCode: 409,
        success: false,
        message: `Duplicate payment receipt blocked (${dupHash.orderRef}). This receipt screenshot has already been submitted.`,
      };
    }

    const dupRef = this.db.paymentRequests.find(
      (r) => r.normalizedTransactionRef === normTxRef && (r.status === 'PENDING' || r.status === 'APPROVED')
    );
    if (dupRef) {
      return {
        statusCode: 409,
        success: false,
        message: `Duplicate transaction reference blocked (${dupRef.orderRef}). Transaction reference "${txRef}" was already used.`,
      };
    }

    const rec = this.ensureRecord(params.userId, cleanEmail, params.username);
    const pendingCountForUser = this.db.paymentRequests.filter(
      (r) =>
        r.status === 'PENDING' &&
        (r.userId === rec.userId || normalizeEmail(r.customerEmail) === cleanEmail)
    ).length;
    if (pendingCountForUser >= 3) {
      return {
        statusCode: 429,
        success: false,
        message: 'You already have 3 pending payment requests awaiting review. Please wait for admin approval.',
      };
    }

    // Store receipt securely with server-generated safe filename
    this.ensureDirs();
    const safeFileName = `rcp_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${imgType.ext}`;
    const destPath = path.resolve(RECEIPTS_DIR, safeFileName);
    if (!destPath.startsWith(RECEIPTS_DIR + path.sep)) {
      return { statusCode: 400, success: false, message: 'Invalid storage path.' };
    }
    fs.writeFileSync(destPath, buffer);

    // Server-authoritative LKR amount calculation
    const expectedAmountLkr = Number(this.db.packagePricesLkr[pkg]);
    const reqId = `subreq-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const orderRef = `YH-SUB-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const requestRecord: ManualPaymentRequest = {
      id: reqId,
      orderRef,
      userId: rec.userId,
      customerEmail: cleanEmail,
      customerName: rec.username,
      packageId: pkg,
      expectedAmountLkr,
      transactionReference: txRef,
      normalizedTransactionRef: normTxRef,
      paymentDate: cleanDate,
      receiptFileName: safeFileName,
      receiptMimeType: imgType.mime,
      receiptSizeBytes: buffer.length,
      receiptSha256: sha256,
      notes: String(params.notes || '').trim().slice(0, 300),
      status: 'PENDING',
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      activatedUntil: null,
    };

    this.db.paymentRequests.unshift(requestRecord);
    this.pushNotification({
      userId: rec.userId,
      email: cleanEmail,
      title: `Payment Submitted (${orderRef})`,
      message: `Your LKR ${expectedAmountLkr.toLocaleString()} manual bank transfer receipt for YASHI HALLS ${pkg.toUpperCase()} is now PENDING admin verification.`,
      type: 'info',
    });

    try {
      adminStore.syncCustomer(rec.userId, cleanEmail, rec.username);
      adminStore.addAuditLog(
        cleanEmail,
        'SUBSCRIPTION_PAYMENT_SUBMITTED',
        `Submitted ${pkg.toUpperCase()} payment request ${orderRef} (LKR ${expectedAmountLkr}, TxRef: ${txRef})`,
        reqId
      );
    } catch {}

    this.saveDb();

    return {
      statusCode: 201,
      success: true,
      message: 'Payment receipt submitted successfully. Your subscription will activate for 30 days once approved by an admin.',
      request: {
        ...requestRecord,
        receiptUrl: `/api/subscriptions/receipts/${encodeURIComponent(requestRecord.receiptFileName)}`,
      },
    };
  }

  public reviewPaymentRequest(params: {
    requestId: string;
    action: 'APPROVE' | 'REJECT';
    adminEmail: string;
    rejectionReason?: string;
  }): { statusCode: number; success: boolean; message: string; request?: any; subscription?: any } {
    const req = this.db.paymentRequests.find(
      (r) => r.id === params.requestId || r.orderRef === params.requestId
    );
    if (!req) {
      return { statusCode: 404, success: false, message: 'Payment request not found.' };
    }
    if (req.status !== 'PENDING') {
      return {
        statusCode: 400,
        success: false,
        message: `This payment request is already ${req.status} and cannot be processed twice.`,
      };
    }

    const nowIso = new Date().toISOString();

    if (params.action === 'REJECT') {
      req.status = 'REJECTED';
      req.reviewedAt = nowIso;
      req.reviewedBy = params.adminEmail;
      req.rejectionReason =
        String(params.rejectionReason || '').trim().slice(0, 300) ||
        'Payment could not be verified. Please contact support or resubmit a valid receipt.';

      this.pushNotification({
        userId: req.userId,
        email: req.customerEmail,
        title: `Payment Rejected (${req.orderRef})`,
        message: `Your ${req.packageId.toUpperCase()} payment request was rejected: ${req.rejectionReason}`,
        type: 'warning',
      });

      try {
        adminStore.addAuditLog(
          params.adminEmail,
          'SUBSCRIPTION_PAYMENT_REJECTED',
          `Rejected ${req.orderRef} (${req.customerEmail}) — Reason: ${req.rejectionReason}`,
          req.id
        );
      } catch {}

      this.saveDb();
      return {
        statusCode: 200,
        success: true,
        message: `Payment request ${req.orderRef} rejected.`,
        request: {
          ...req,
          receiptUrl: `/api/subscriptions/receipts/${encodeURIComponent(req.receiptFileName)}`,
        },
      };
    }

    // APPROVE path — Double-check duplicate hash/ref hasn't been approved via another record
    const alreadyApproved = this.db.paymentRequests.find(
      (r) =>
        r.id !== req.id &&
        r.status === 'APPROVED' &&
        (r.receiptSha256 === req.receiptSha256 ||
          r.normalizedTransactionRef === req.normalizedTransactionRef)
    );
    if (alreadyApproved) {
      return {
        statusCode: 409,
        success: false,
        message: `Duplicate conflict: receipt or transaction reference was already approved under ${alreadyApproved.orderRef}.`,
      };
    }

    const rec = this.ensureRecord(req.userId, req.customerEmail, req.customerName);
    const nowMs = Date.now();
    const currentExpMs = rec.expiresAt ? Date.parse(rec.expiresAt) : 0;
    const isExtendingSameTier =
      rec.plan === req.packageId &&
      rec.status === 'ACTIVE' &&
      !Number.isNaN(currentExpMs) &&
      currentExpMs > nowMs;

    const baseStartMs = isExtendingSameTier ? currentExpMs : nowMs;
    const expiresAtIso = new Date(baseStartMs + THIRTY_DAYS_MS).toISOString();

    req.status = 'APPROVED';
    req.reviewedAt = nowIso;
    req.reviewedBy = params.adminEmail;
    req.activatedUntil = expiresAtIso;

    rec.plan = req.packageId;
    rec.status = 'ACTIVE';
    rec.activatedAt = isExtendingSameTier && rec.activatedAt ? rec.activatedAt : nowIso;
    rec.expiresAt = expiresAtIso;
    rec.downgradedAt = null;
    rec.paymentReference = req.transactionReference;
    rec.paymentRequestId = req.id;
    rec.remindedMilestones = [];
    rec.updatedAt = nowIso;

    this.pushNotification({
      userId: rec.userId,
      email: rec.email,
      title: `${req.packageId.toUpperCase()} Package Activated (30 Days)`,
      message: `Admin verified payment ${req.orderRef} (Ref: ${req.transactionReference}). Your YASHI HALLS ${req.packageId.toUpperCase()} dashboard & features are active until ${new Date(expiresAtIso).toLocaleDateString()}.`,
      type: 'success',
    });

    try {
      const cust = adminStore.syncCustomer(rec.userId, rec.email, rec.username, req.packageId);
      cust.plan = req.packageId;
      cust.planActivatedAt = rec.activatedAt;
      cust.planExpiresAt = rec.expiresAt;
      adminStore.saveDatabase(adminStore.db);
      adminStore.addAuditLog(
        params.adminEmail,
        'SUBSCRIPTION_PAYMENT_APPROVED',
        `Approved ${req.orderRef} for ${rec.email} -> Activated ${req.packageId.toUpperCase()} until ${expiresAtIso} (LKR ${req.expectedAmountLkr})`,
        req.id
      );
    } catch {}

    this.syncBotTierForUser(rec.userId, req.packageId);
    this.saveDb();

    return {
      statusCode: 200,
      success: true,
      message: `Approved ${req.orderRef}. ${req.customerEmail} activated on ${req.packageId.toUpperCase()} for 30 days.`,
      request: {
        ...req,
        receiptUrl: `/api/subscriptions/receipts/${encodeURIComponent(req.receiptFileName)}`,
      },
      subscription: this.formatSubscriptionSummary(rec),
    };
  }

  public adminUpdateConfig(
    params: {
      bankDetails?: Partial<BankDetailsConfig>;
      packagePricesLkr?: { pro?: number; business?: number };
    },
    adminEmail: string
  ) {
    if (params.bankDetails) {
      const b = params.bankDetails;
      this.db.bankDetails = {
        bankName: String(b.bankName ?? this.db.bankDetails.bankName).trim().slice(0, 120),
        accountName: String(b.accountName ?? this.db.bankDetails.accountName).trim().slice(0, 120),
        accountNumber: String(b.accountNumber ?? this.db.bankDetails.accountNumber).trim().slice(0, 60),
        branchName: String(b.branchName ?? this.db.bankDetails.branchName).trim().slice(0, 120),
        swiftOrCode: String(b.swiftOrCode ?? this.db.bankDetails.swiftOrCode ?? '').trim().slice(0, 40),
        instructions: String(b.instructions ?? this.db.bankDetails.instructions).trim().slice(0, 600),
      };
    }

    if (params.packagePricesLkr) {
      const proVal = Number(params.packagePricesLkr.pro);
      const bizVal = Number(params.packagePricesLkr.business);
      if (!Number.isNaN(proVal) && proVal >= 1 && proVal <= 1000000) {
        this.db.packagePricesLkr.pro = Math.round(proVal);
      }
      if (!Number.isNaN(bizVal) && bizVal >= 1 && bizVal <= 1000000) {
        this.db.packagePricesLkr.business = Math.round(bizVal);
      }
      this.db.packagePricesLkr.mini = 0;
    }

    try {
      adminStore.addAuditLog(
        adminEmail,
        'UPDATE_SUBSCRIPTION_BILLING_CONFIG',
        `Updated bank details & monthly prices (PRO: LKR ${this.db.packagePricesLkr.pro}, BUSINESS: LKR ${this.db.packagePricesLkr.business})`
      );
    } catch {}

    this.saveDb();
    return this.getPublicBillingConfig();
  }

  public getAdminOverview() {
    this.runExpiryAndReminderSweep();

    // Sync any customers known in adminStore who don't have a subscription record yet
    try {
      const customers = adminStore.getCustomers() as any[];
      let added = false;
      for (const c of customers) {
        if (!c?.email) continue;
        const existing = this.findRecord(c.id, c.email);
        if (!existing) {
          const key = normalizeUserIdKey(c.id, c.email);
          this.db.subscriptions[key] = {
            userId: key,
            email: normalizeEmail(c.email),
            username: c.username || c.email.split('@')[0],
            plan: 'mini',
            status: 'FREE',
            activatedAt: null,
            expiresAt: null,
            downgradedAt: null,
            paymentReference: null,
            paymentRequestId: null,
            remindedMilestones: [],
            updatedAt: new Date().toISOString(),
          };
          added = true;
        }
      }
      if (added) this.saveDb();
    } catch {}

    const allSubs = Object.values(this.db.subscriptions).map((r) =>
      this.formatSubscriptionSummary(r)
    );
    const activeSubscriptions = allSubs.filter(
      (s) => s.plan !== 'mini' && s.status === 'ACTIVE'
    );
    const expiredSubscriptions = allSubs.filter((s) => s.status === 'EXPIRED');

    const requests = this.db.paymentRequests.map((r) => ({
      ...r,
      receiptUrl: `/api/subscriptions/receipts/${encodeURIComponent(r.receiptFileName)}`,
    }));

    const approved = requests.filter((r) => r.status === 'APPROVED');
    const pending = requests.filter((r) => r.status === 'PENDING');
    const rejected = requests.filter((r) => r.status === 'REJECTED');

    const proRevenueLkr = approved
      .filter((r) => r.packageId === 'pro')
      .reduce((acc, r) => acc + (Number(r.expectedAmountLkr) || 0), 0);
    const businessRevenueLkr = approved
      .filter((r) => r.packageId === 'business')
      .reduce((acc, r) => acc + (Number(r.expectedAmountLkr) || 0), 0);

    return {
      config: this.getPublicBillingConfig(),
      requests,
      subscriptions: allSubs,
      activeSubscriptions,
      expiredSubscriptions,
      revenue: {
        totalRevenueLkr: proRevenueLkr + businessRevenueLkr,
        proRevenueLkr,
        businessRevenueLkr,
        approvedCount: approved.length,
        pendingCount: pending.length,
        rejectedCount: rejected.length,
        proActiveCount: activeSubscriptions.filter((s) => s.plan === 'pro').length,
        businessActiveCount: activeSubscriptions.filter((s) => s.plan === 'business').length,
        expiredCount: expiredSubscriptions.length,
      },
    };
  }

  public resolveReceiptFileForRequest(
    fileName: string,
    principal: { uid: string; email: string; isAdmin: boolean }
  ): { allowed: boolean; filePath?: string; mimeType?: string } {
    const safeName = path.basename(String(fileName || '').trim());
    if (!safeName) return { allowed: false };
    const reqRecord = this.db.paymentRequests.find((r) => r.receiptFileName === safeName);
    if (!reqRecord) return { allowed: false };

    const isOwner =
      reqRecord.userId === principal.uid ||
      normalizeEmail(reqRecord.customerEmail) === normalizeEmail(principal.email);
    if (!principal.isAdmin && !isOwner) {
      return { allowed: false };
    }

    const resolved = path.resolve(RECEIPTS_DIR, safeName);
    if (!resolved.startsWith(RECEIPTS_DIR + path.sep) || !fs.existsSync(resolved)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      filePath: resolved,
      mimeType: reqRecord.receiptMimeType || 'image/png',
    };
  }

  public adminForceExpireOrDowngrade(userIdOrEmail: string, adminEmail: string) {
    const rec = this.findRecord(userIdOrEmail, userIdOrEmail);
    if (!rec) return null;
    rec.plan = 'mini';
    rec.status = 'EXPIRED';
    rec.expiresAt = new Date().toISOString();
    rec.downgradedAt = new Date().toISOString();
    rec.updatedAt = new Date().toISOString();
    this.syncBotTierForUser(rec.userId, 'mini');
    try {
      const cust = adminStore.getCustomer(rec.userId) || adminStore.getCustomer(rec.email);
      if (cust) {
        cust.plan = 'mini';
        cust.planExpiresAt = rec.expiresAt;
        adminStore.saveDatabase(adminStore.db);
      }
      adminStore.addAuditLog(
        adminEmail,
        'ADMIN_FORCE_DOWNGRADE_MINI',
        `Downgraded ${rec.email} to MINI`,
        rec.userId
      );
    } catch {}
    this.saveDb();
    return this.formatSubscriptionSummary(rec);
  }
}

export const subscriptionService = new SubscriptionService();
