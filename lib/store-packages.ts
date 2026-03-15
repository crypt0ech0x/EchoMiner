// lib/store-packages.ts

export type StorePackage = {
  id: string;
  name: string;
  solAmount: number;
  echoAmount: number;
  badge?: string;
  description: string;
  mostPopular?: boolean;
  highlight?: boolean;
  bonusEcho?: number;
};

export const STORE_PACKAGES: StorePackage[] = [
  {
    id: "starter",
    name: "Starter Pack",
    solAmount: 0.01,
    echoAmount: 200,
    badge: "Entry",
    description: "Low-cost entry pack for first-time buyers.",
  },
  {
    id: "explorer",
    name: "Explorer Pack",
    solAmount: 0.05,
    echoAmount: 1200,
    badge: "Step Up",
    description: "A stronger value pack for users growing their ECHO balance.",
  },
  {
    id: "miner",
    name: "Miner Pack",
    solAmount: 0.1,
    echoAmount: 3500,
    badge: "⭐ MOST POPULAR",
    description: "Best balance of price and value. The smartest buy for most users.",
    mostPopular: true,
    highlight: true,
  },
  {
    id: "whale",
    name: "Whale Pack",
    solAmount: 0.2,
    echoAmount: 7000,
    badge: "High Value",
    description: "Larger pack for committed miners who want more ECHO per purchase.",
  },
  {
    id: "legend",
    name: "Legend Pack",
    solAmount: 0.5,
    echoAmount: 22000,
    badge: "Elite",
    description: "Premium pack with strong value for serious accumulators.",
  },
  {
    id: "resonance",
    name: "Resonance Pack",
    solAmount: 1,
    echoAmount: 60000,
    badge: "Best Value",
    description: "Top-tier whale pack with maximum ECHO per SOL.",
  },
];

export function getStorePackage(packageId: string) {
  return STORE_PACKAGES.find((pkg) => pkg.id === packageId) ?? null;
}

export function getStorePackageTotalEcho(pkg: StorePackage) {
  return Number(pkg.echoAmount ?? 0) + Number(pkg.bonusEcho ?? 0);
}

export function getStorePackageValuePerSol(pkg: StorePackage) {
  if (!pkg.solAmount) return 0;
  return getStorePackageTotalEcho(pkg) / pkg.solAmount;
}