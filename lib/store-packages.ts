// lib/store-packages.ts

export type StorePackage = {
  id: string;
  name: string;
  solAmount: number;
  echoAmount: number;
  badge?: string;
  description: string;
};

export const STORE_PACKAGES: StorePackage[] = [
  {
    id: "starter",
    name: "Starter Pack",
    solAmount: 0.1,
    echoAmount: 100,
    badge: "Entry",
    description: "Get your first ECHO boost with a small SOL purchase.",
  },
  {
    id: "pro",
    name: "Pro Pack",
    solAmount: 0.5,
    echoAmount: 600,
    badge: "Popular",
    description: "Best early value for building your ECHO balance faster.",
  },
  {
    id: "whale",
    name: "Whale Pack",
    solAmount: 1,
    echoAmount: 1400,
    badge: "Best Value",
    description: "Largest pack for users who want maximum acceleration.",
  },
];

export function getStorePackage(packageId: string) {
  return STORE_PACKAGES.find((pkg) => pkg.id === packageId) ?? null;
}