// ════════════════════════════════════════════════════════════════
// ECONOMY SERVICE — Wallets, Transactions, Ledger
// ════════════════════════════════════════════════════════════════
//
// Phase M: Real economy service. Per-player wallets, atomic
// debit/credit, append-only transaction ledger.
//
// Contracts fulfilled:
//   - economy.wallet: get/create balance, mint, burn
//   - economy.tx: transfer (atomic debit+credit), history
//
// The OS provides this; packages consume it through KernelContext.
// requestService("economy", "transfer", {...}).

import { db } from "@/lib/db";

export interface Wallet {
  id: string;
  playerId: string;
  worldProjectId: string;
  currency: string;
  balance: number;
}

export interface Transaction {
  id: string;
  fromWalletId: string | null;
  toWalletId: string | null;
  amount: number;
  currency: string;
  reason: string;
  reference: string | null;
  status: string;
  createdAt: Date;
}

function mapWallet(w: any): Wallet {
  return {
    id: w.id,
    playerId: w.playerId,
    worldProjectId: w.worldProjectId,
    currency: w.currency,
    balance: w.balance,
  };
}

function mapTx(t: any): Transaction {
  return {
    id: t.id,
    fromWalletId: t.fromWalletId,
    toWalletId: t.toWalletId,
    amount: t.amount,
    currency: t.currency,
    reason: t.reason,
    reference: t.reference,
    status: t.status,
    createdAt: t.createdAt,
  };
}

// ── Get or create a wallet ───────────────────────────────────────
export async function getOrCreateWallet(
  playerId: string,
  worldProjectId: string,
  currency: string = "PL"
): Promise<Wallet> {
  const wallet = await db.playerWallet.upsert({
    where: { playerId_worldProjectId_currency: { playerId, worldProjectId, currency } },
    update: {},
    create: { playerId, worldProjectId, currency, balance: 0 },
  });
  return mapWallet(wallet);
}

// ── Get balance ─────────────────────────────────────────────────
export async function getBalance(
  playerId: string,
  worldProjectId: string,
  currency: string = "PL"
): Promise<number> {
  const wallet = await db.playerWallet.findUnique({
    where: { playerId_worldProjectId_currency: { playerId, worldProjectId, currency } },
  });
  return wallet?.balance ?? 0;
}

// ── Mint (system credit) ────────────────────────────────────────
export async function mint(
  playerId: string,
  worldProjectId: string,
  amount: number,
  reason: string = "mint",
  reference?: string,
  currency: string = "PL"
): Promise<{ wallet: Wallet; tx: Transaction }> {
  if (amount <= 0) throw new Error("amount must be positive");
  return db.$transaction(async (tx) => {
    const wallet = await tx.playerWallet.upsert({
      where: { playerId_worldProjectId_currency: { playerId, worldProjectId, currency } },
      update: { balance: { increment: amount } },
      create: { playerId, worldProjectId, currency, balance: amount },
    });
    const econTx = await tx.economyTransaction.create({
      data: { fromWalletId: null, toWalletId: wallet.id, amount, currency, reason, reference: reference ?? null, status: "confirmed" },
    });
    return { wallet: mapWallet(wallet), tx: mapTx(econTx) };
  });
}

// ── Burn (system debit) ─────────────────────────────────────────
export async function burn(
  playerId: string,
  worldProjectId: string,
  amount: number,
  reason: string = "burn",
  reference?: string,
  currency: string = "PL"
): Promise<{ wallet: Wallet; tx: Transaction }> {
  if (amount <= 0) throw new Error("amount must be positive");
  return db.$transaction(async (tx) => {
    const wallet = await tx.playerWallet.findUnique({
      where: { playerId_worldProjectId_currency: { playerId, worldProjectId, currency } },
    });
    if (!wallet) throw new Error("wallet not found");
    if (wallet.balance < amount) throw new Error("insufficient balance");
    const updated = await tx.playerWallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amount } },
    });
    const econTx = await tx.economyTransaction.create({
      data: { fromWalletId: wallet.id, toWalletId: null, amount, currency, reason, reference: reference ?? null, status: "confirmed" },
    });
    return { wallet: mapWallet(updated), tx: mapTx(econTx) };
  });
}

// ── Transfer (atomic debit + credit) ────────────────────────────
export async function transfer(
  fromPlayerId: string,
  toPlayerId: string,
  worldProjectId: string,
  amount: number,
  reason: string = "transfer",
  reference?: string,
  currency: string = "PL"
): Promise<{ fromWallet: Wallet; toWallet: Wallet; tx: Transaction }> {
  if (amount <= 0) throw new Error("amount must be positive");
  if (fromPlayerId === toPlayerId) throw new Error("cannot transfer to self");
  return db.$transaction(async (tx) => {
    const fromWallet = await tx.playerWallet.findUnique({
      where: { playerId_worldProjectId_currency: { playerId: fromPlayerId, worldProjectId, currency } },
    });
    if (!fromWallet) throw new Error("source wallet not found");
    if (fromWallet.balance < amount) throw new Error("insufficient balance");

    const toWallet = await tx.playerWallet.upsert({
      where: { playerId_worldProjectId_currency: { playerId: toPlayerId, worldProjectId, currency } },
      update: { balance: { increment: amount } },
      create: { playerId: toPlayerId, worldProjectId, currency, balance: amount },
    });

    const updatedFrom = await tx.playerWallet.update({
      where: { id: fromWallet.id },
      data: { balance: { decrement: amount } },
    });

    const econTx = await tx.economyTransaction.create({
      data: { fromWalletId: fromWallet.id, toWalletId: toWallet.id, amount, currency, reason, reference: reference ?? null, status: "confirmed" },
    });

    return { fromWallet: mapWallet(updatedFrom), toWallet: mapWallet(toWallet), tx: mapTx(econTx) };
  });
}

// ── Transaction history ─────────────────────────────────────────
export async function getTransactionHistory(
  playerId: string,
  worldProjectId: string,
  currency: string = "PL",
  limit: number = 50
): Promise<Transaction[]> {
  const wallet = await db.playerWallet.findUnique({
    where: { playerId_worldProjectId_currency: { playerId, worldProjectId, currency } },
  });
  if (!wallet) return [];
  const txs = await db.economyTransaction.findMany({
    where: { OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }] },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return txs.map(mapTx);
}
