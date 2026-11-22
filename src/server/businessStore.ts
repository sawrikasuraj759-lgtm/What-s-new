import fs from 'fs';
import path from 'path';

export type BusinessPlatform = 'android' | 'ios' | 'pc' | 'android_ios' | 'glory_bot';

export interface BusinessPricePackage {
  id: string;
  days: string;
  price: string;
}

export interface BusinessProduct {
  id: string;
  name: string;
  category: string;
  platform: BusinessPlatform;
  price: string;
  command?: string;
  packages?: BusinessPricePackage[];
  subtitle: string;
  description: string;
  logoUrl: string;
  inStock: boolean;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessStoreData {
  storeName: string;
  mainLogoUrl: string;
  welcomeText: string;
  panelButtonText: string;
  gloryButtonText: string;
  orderInstructions: string;
  categories: string[];
  products: BusinessProduct[];
  updatedAt: string;
}

const DEFAULT_CATEGORIES = [
  'ANDROID+ IOS WEBMODE',
  'FF APK MOD NON ROOT',
  'FF MOBILE ROOT',
  'FF PROXY',
  'IOS HACK',
  'OTHER',
];

function createDefaultProducts(): BusinessProduct[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'prod-phanthom',
      name: 'Phanthom Android+ iOS',
      category: 'ANDROID+ IOS WEBMODE',
      platform: 'android_ios',
      price: '$0.06',
      subtitle: 'Android+ Ios',
      description: 'Android + iOS WebMode Panel with full control & safe stable updates.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-xreg',
      name: 'XREG ANDROID+ iOS',
      category: 'ANDROID+ IOS WEBMODE',
      platform: 'android_ios',
      price: '$0.06',
      subtitle: 'Android+ Ios',
      description: 'Aimbot, ESP & No Root features for Android & iOS.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-balamod',
      name: 'BALAMOD ANDROID',
      category: 'FF APK MOD NON ROOT',
      platform: 'android',
      price: '$0.06',
      subtitle: 'Android Non Root Support',
      description: 'Main ID safe Free Fire Non-Root APKMod.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-hgcheats',
      name: 'HG CHEATS APKMOD',
      category: 'FF APK MOD NON ROOT',
      platform: 'android',
      price: '$0.20',
      subtitle: 'Safe Normal • Android Non Root',
      description: 'Easy setup, Antiban & Anti-Blacklist Non-Root APKMod.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-rapidcore',
      name: 'RAPID CORE ROOT',
      category: 'FF MOBILE ROOT',
      platform: 'android',
      price: '$0.10',
      subtitle: 'Android Root',
      description: 'High-performance Free Fire Mobile Root panel.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-zrex',
      name: 'ZREX ANDROID+ iOS',
      category: 'FF PROXY',
      platform: 'android_ios',
      price: '$0.10',
      subtitle: 'Android+ Ios Support',
      description: 'Non Root + iOS Premium Proxy solution.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-gbox',
      name: 'GBOX ESGIN CERTIFICATE',
      category: 'IOS HACK',
      platform: 'ios',
      price: '$1.50',
      subtitle: 'iOS • 1 Year • 30 Day Warranty',
      description: 'Official iOS E-Sign & GBox Certificate with 30-day warranty claim.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-velora',
      name: 'VELORA EXTERNAL',
      category: 'IOS HACK',
      platform: 'ios',
      price: '$0.30',
      subtitle: 'iOS External',
      description: 'Velora iOS External built for winners.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-guild-glory',
      name: 'GUILD GLORY BOT',
      category: 'OTHER',
      platform: 'glory_bot',
      price: '$0.70',
      subtitle: 'Free Fire Glory Bot',
      description: 'Auto Guild Glory Bot — Fast, 24/7 Safe & Reliable Guild Glory Boosting.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-drip-apkmod',
      name: 'DRIP APKMOD',
      category: 'OTHER',
      platform: 'android',
      price: '$0.11',
      subtitle: 'Android APKMod',
      description: 'Free Fire Drip Client APKMod with Aimbot & ESP.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-drip-wire',
      name: 'DRIP WIRE ANDROID+ iOS',
      category: 'OTHER',
      platform: 'android_ios',
      price: '$0.10',
      subtitle: 'Android+ Ios',
      description: 'Free Fire Drip Wire Android / iOS 4.0.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-brmods',
      name: 'BR MODS SILENT AIM PC',
      category: 'OTHER',
      platform: 'pc',
      price: '$0.20',
      subtitle: 'PC / Emulator',
      description: 'BR Mods Silent Aim PC & Emulator edition.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-pato-orange',
      name: 'PATO ORANGE APKMOD',
      category: 'OTHER',
      platform: 'android',
      price: '$0.80',
      subtitle: 'Android APKMod',
      description: 'Pato Orange APKMod for Android.',
      logoUrl: '',
      inStock: true,
      verified: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function sanitizeTenantId(userId: string): string {
  const clean = (userId || 'primary').replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean || 'primary';
}

function getStoreFilePath(userId: string): string {
  const safeId = sanitizeTenantId(userId);
  return path.resolve(process.cwd(), 'data', 'sessions', safeId, 'business_store.json');
}

function getAssetsDir(userId: string): string {
  const safeId = sanitizeTenantId(userId);
  return path.resolve(process.cwd(), 'data', 'business_assets', safeId);
}

function parseNumericPrice(raw: string): number | null {
  const cleaned = String(raw || '').replace(/,/g, '');
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function sanitizeBusinessPackages(rawPackages: any): BusinessPricePackage[] {
  if (!Array.isArray(rawPackages)) return [];
  const result: BusinessPricePackage[] = [];
  for (let i = 0; i < rawPackages.length; i++) {
    const item = rawPackages[i];
    if (!item || typeof item !== 'object') continue;
    const days = String(item.days ?? '').trim();
    const price = String(item.price ?? '').trim();
    if (!days && !price) continue;
    result.push({
      id:
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim()
          : `pkg-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      days: days || '1 Day',
      price: price || '$0.00',
    });
  }
  return result;
}

export function deriveDisplayPrice(fallbackPrice: string, packages?: BusinessPricePackage[]): string {
  const cleanPackages = Array.isArray(packages) ? packages.filter((p) => p.price && p.price.trim()) : [];
  if (cleanPackages.length === 0) {
    return (fallbackPrice || '').trim() || '$0.00';
  }
  let best = cleanPackages[0].price.trim();
  let bestNum = parseNumericPrice(best);
  for (let i = 1; i < cleanPackages.length; i++) {
    const candidate = cleanPackages[i].price.trim();
    const num = parseNumericPrice(candidate);
    if (num !== null && (bestNum === null || num < bestNum)) {
      bestNum = num;
      best = candidate;
    }
  }
  return best;
}

const RESERVED_BIZ_SLUGS = new Set([
  'menu', 'panels', 'panel', 'android', 'ios', 'pc', 'glory', 'home', 'start', 'shop', 'store', 'catalog', 'all', 'hi', 'hy', 'hello', 'ping', 'alive',
]);

export function sanitizePanelCommandSlug(rawCommand: string | undefined, fallbackName: string): string {
  const raw = String(rawCommand || '').trim().toLowerCase().replace(/^[./!#]+/, '');
  const cleanRaw = raw.replace(/[^a-z0-9_-]/g, '');
  if (cleanRaw && !RESERVED_BIZ_SLUGS.has(cleanRaw)) {
    return cleanRaw.slice(0, 20);
  }
  const filler = new Set(['android', 'ios', 'webmode', 'apk', 'apkmod', 'mod', 'certificate', 'external', 'root', 'non', 'silent', 'aim', 'pc', 'emulator', 'proxy', 'esgin', 'esign', 'guild', 'free', 'fire', 'panel', 'panels']);
  const words = String(fallbackName || 'panel')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !filler.has(w));
  const picked = (meaningful.length > 0 ? meaningful : words).slice(0, 2).join('');
  const slug = picked.replace(/[^a-z0-9]/g, '').slice(0, 14);
  if (slug && !RESERVED_BIZ_SLUGS.has(slug)) {
    return slug;
  }
  return `key${slug || Math.random().toString(36).slice(2, 6)}`;
}

function normalizeProductsWithCommands(products: BusinessProduct[]): BusinessProduct[] {
  const used = new Set<string>();
  return products.map((p) => {
    const packages = sanitizeBusinessPackages(p?.packages);
    const baseSlug = sanitizePanelCommandSlug(p?.command, p?.name || p?.id || 'panel');
    let candidate = baseSlug;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${baseSlug}${suffix}`;
      suffix++;
    }
    used.add(candidate);
    return {
      ...p,
      command: `.${candidate}`,
      packages,
      price: packages.length > 0 ? deriveDisplayPrice(p?.price || '', packages) : (p?.price || '$0.00'),
    };
  });
}

export function getBusinessStore(userId: string): BusinessStoreData {
  const filePath = getStoreFilePath(userId);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const products: BusinessProduct[] = Array.isArray(parsed.products)
        ? normalizeProductsWithCommands(parsed.products)
        : normalizeProductsWithCommands(createDefaultProducts());
      return {
        storeName: parsed.storeName || 'YASHI BUSINESS STORE',
        mainLogoUrl: parsed.mainLogoUrl || '',
        welcomeText:
          parsed.welcomeText ||
          'ආයුබෝවන්! 👋\nඔබට අවශ්‍ය වන්නේ *මොබයිල් පැනල්* ද නැතිනම් *Free Fire Glory Bot* ද?\nපහත බටන් වලින් කැමති එක තෝරන්න 👇',
        panelButtonText: parsed.panelButtonText || '📱 මොබයිල් පැනල්',
        gloryButtonText: parsed.gloryButtonText || '🔥 Free Fire Glory Bot',
        orderInstructions:
          parsed.orderInstructions ||
          'මිලදී ගැනීම සඳහා අපගේ Owner සම්බන්ධ කරගන්න හෝ Payment Slip එක මෙහි එවන්න.',
        categories: Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : [...DEFAULT_CATEGORIES],
        products,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    } catch {
      // fall through to default creation
    }
  }

  const initial: BusinessStoreData = {
    storeName: 'YASHI BUSINESS STORE',
    mainLogoUrl: '',
    welcomeText:
      'ආයුබෝවන්! 👋\nඔබට අවශ්‍ය වන්නේ *මොබයිල් පැනල්* ද නැතිනම් *Free Fire Glory Bot* ද?\nපහත බටන් වලින් කැමති එක තෝරන්න 👇',
    panelButtonText: '📱 මොබයිල් පැනල්',
    gloryButtonText: '🔥 Free Fire Glory Bot',
    orderInstructions:
      'මිලදී ගැනීම සඳහා අපගේ Owner සම්බන්ධ කරගන්න හෝ Payment Slip එක මෙහි එවන්න.',
    categories: [...DEFAULT_CATEGORIES],
    products: createDefaultProducts(),
    updatedAt: new Date().toISOString(),
  };

  saveBusinessStore(userId, initial);
  return initial;
}

export function saveBusinessStore(userId: string, data: BusinessStoreData): BusinessStoreData {
  const filePath = getStoreFilePath(userId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const updated: BusinessStoreData = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  return updated;
}

export function updateBusinessStoreSettings(
  userId: string,
  partial: Partial<Pick<BusinessStoreData, 'storeName' | 'mainLogoUrl' | 'welcomeText' | 'panelButtonText' | 'gloryButtonText' | 'orderInstructions' | 'categories'>>
): BusinessStoreData {
  const store = getBusinessStore(userId);
  const next: BusinessStoreData = {
    ...store,
    ...(partial.storeName !== undefined ? { storeName: partial.storeName } : {}),
    ...(partial.mainLogoUrl !== undefined ? { mainLogoUrl: partial.mainLogoUrl } : {}),
    ...(partial.welcomeText !== undefined ? { welcomeText: partial.welcomeText } : {}),
    ...(partial.panelButtonText !== undefined ? { panelButtonText: partial.panelButtonText } : {}),
    ...(partial.gloryButtonText !== undefined ? { gloryButtonText: partial.gloryButtonText } : {}),
    ...(partial.orderInstructions !== undefined ? { orderInstructions: partial.orderInstructions } : {}),
    ...(Array.isArray(partial.categories) ? { categories: partial.categories } : {}),
  };
  return saveBusinessStore(userId, next);
}

export function addBusinessProduct(
  userId: string,
  input: Omit<BusinessProduct, 'id' | 'createdAt' | 'updatedAt'>
): BusinessStoreData {
  const store = getBusinessStore(userId);
  const cleanCategory = (input.category || 'OTHER').trim().toUpperCase();
  if (!store.categories.includes(cleanCategory)) {
    store.categories.push(cleanCategory);
  }
  const cleanPackages = sanitizeBusinessPackages(input.packages);
  const resolvedPrice = deriveDisplayPrice(input.price || '', cleanPackages);
  const slug = sanitizePanelCommandSlug(input.command, input.name);
  const used = new Set(store.products.map((p) => sanitizePanelCommandSlug(p.command, p.name)));
  let uniqueSlug = slug;
  let counter = 2;
  while (used.has(uniqueSlug)) {
    uniqueSlug = `${slug}${counter}`;
    counter++;
  }
  const now = new Date().toISOString();
  const product: BusinessProduct = {
    id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim(),
    category: cleanCategory,
    platform: input.platform || 'android',
    price: resolvedPrice,
    command: `.${uniqueSlug}`,
    packages: cleanPackages,
    subtitle: (input.subtitle || '').trim(),
    description: (input.description || '').trim(),
    logoUrl: (input.logoUrl || '').trim(),
    inStock: input.inStock !== false,
    verified: input.verified !== false,
    createdAt: now,
    updatedAt: now,
  };
  store.products.unshift(product);
  return saveBusinessStore(userId, store);
}

export function updateBusinessProduct(
  userId: string,
  productId: string,
  updates: Partial<BusinessProduct>
): BusinessStoreData {
  const store = getBusinessStore(userId);
  const idx = store.products.findIndex((p) => p.id === productId);
  if (idx === -1) {
    throw new Error('Product not found');
  }
  const existing = store.products[idx];
  const nextCategory = updates.category ? updates.category.trim().toUpperCase() : existing.category;
  if (nextCategory && !store.categories.includes(nextCategory)) {
    store.categories.push(nextCategory);
  }
  const nextPackages =
    updates.packages !== undefined
      ? sanitizeBusinessPackages(updates.packages)
      : sanitizeBusinessPackages(existing.packages);
  const nextPrice =
    updates.packages !== undefined
      ? nextPackages.length > 0
        ? deriveDisplayPrice(updates.price ?? existing.price, nextPackages)
        : (updates.price ?? existing.price).trim() || '$0.00'
      : updates.price !== undefined
      ? updates.price.trim() || '$0.00'
      : existing.price;
  const nextCommand =
    updates.command !== undefined
      ? `.${sanitizePanelCommandSlug(updates.command, updates.name || existing.name)}`
      : existing.command || `.${sanitizePanelCommandSlug(undefined, updates.name || existing.name)}`;
  store.products[idx] = {
    ...existing,
    ...updates,
    id: existing.id,
    category: nextCategory,
    command: nextCommand,
    packages: nextPackages,
    price: nextPrice,
    updatedAt: new Date().toISOString(),
  };
  return saveBusinessStore(userId, store);
}

export function deleteBusinessProduct(userId: string, productId: string): BusinessStoreData {
  const store = getBusinessStore(userId);
  store.products = store.products.filter((p) => p.id !== productId);
  return saveBusinessStore(userId, store);
}

export function saveBusinessAssetFromBase64(
  userId: string,
  base64DataUrl: string,
  prefix = 'logo'
): string {
  const match = base64DataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image format. Please upload a PNG, JPG, or WEBP image.');
  }
  let ext = match[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  if (ext.includes('svg')) ext = 'svg';
  const buffer = Buffer.from(match[2], 'base64');

  const safeId = sanitizeTenantId(userId);
  const assetsDir = getAssetsDir(userId);
  fs.mkdirSync(assetsDir, { recursive: true });
  const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  fs.writeFileSync(path.join(assetsDir, fileName), buffer);

  return `/api/business-store/assets/${safeId}/${fileName}`;
}

export function resolveLocalAssetPath(assetUrl: string): string | null {
  if (!assetUrl || typeof assetUrl !== 'string') return null;
  const prefix = '/api/business-store/assets/';
  if (assetUrl.startsWith(prefix)) {
    const rel = assetUrl.slice(prefix.length);
    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 2) {
      const safeTenant = parts[0].replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFile = path.basename(parts[1]);
      const fullPath = path.resolve(process.cwd(), 'data', 'business_assets', safeTenant, safeFile);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}
