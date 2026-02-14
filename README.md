
# ECHO Miner (Solana Edition)

A production-ready Solana mining simulator built with Next.js 15, Tailwind CSS, and Framer Motion.

## Features
- **Authoritative Node Logic**: Simulated backend state managed via a secure local storage protocol.
- **Crypto-Native UI**: Glassmorphism aesthetic with high-fidelity animations.
- **Dynamic Character System**: NFT-style character avatars using DiceBear Adventurer collection.
- **Streak & Boost Mechanics**: Progressive rewards and temporary ad-watch multipliers.

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Build for Production**:
   ```bash
   npm run build
   ```

## Folder Structure
- `/app`: Next.js App Router (Layouts, Pages, Styles)
- `/components`: Modular UI blocks (Mine, Boost, Store, Wallet)
- `/lib`: Server logic, Constants, and Types
- `/public`: Static assets

## Environment
Create a `.env.local` based on `env.example` if integrating with external Solana RPCs or Stripe.
