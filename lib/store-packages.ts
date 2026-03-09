// lib/store-packages.ts

export type StorePackage = {
  id: string;
  name: string;
  solAmount: number;
  echoAmount: number;
  description: string;
};

export const STORE_PACKAGES: StorePackage[] = [
  {
    id: "starter",
    name: "Starter Pack",
    solAmount: 0.1,
    echoAmount: 100,
    description: "Kickstart your balance.",
  },
  {
    id: "pro",
    name: "Pro Pack",
    solAmount: 0.5,
    echoAmount: 600,
    description: "Better value for active miners.",
  },
  {
    id: "whale",
    name: "Whale Pack",
    solAmount: 1,
    echoAmount: 1400,
    description: "Maximum acceleration.",
  },
];

export function getStorePackage(packageId: string) {
  return STORE_PACKAGES.find((p) => p.id === packageId) ?? null;
}