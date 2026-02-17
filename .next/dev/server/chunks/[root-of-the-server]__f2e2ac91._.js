module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/lib/constants.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AD_BOOST_DURATION_MS",
    ()=>AD_BOOST_DURATION_MS,
    "AD_BOOST_MAX_QUEUE_MS",
    ()=>AD_BOOST_MAX_QUEUE_MS,
    "AD_BOOST_MULTIPLIER",
    ()=>AD_BOOST_MULTIPLIER,
    "BASE_MINING_RATE",
    ()=>BASE_MINING_RATE,
    "GET_STREAK_MULTIPLIER",
    ()=>GET_STREAK_MULTIPLIER,
    "SESSION_DURATION_MS",
    ()=>SESSION_DURATION_MS,
    "STORE_ITEMS",
    ()=>STORE_ITEMS,
    "STREAK_GRACE_PERIOD_MS",
    ()=>STREAK_GRACE_PERIOD_MS
]);
const BASE_MINING_RATE = 0.0001543;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const STREAK_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
const AD_BOOST_DURATION_MS = 60 * 60 * 1000;
const AD_BOOST_MULTIPLIER = 2.0;
const AD_BOOST_MAX_QUEUE_MS = 3 * 60 * 60 * 1000;
const GET_STREAK_MULTIPLIER = (days)=>Math.max(1, days);
const STORE_ITEMS = [
    {
        id: 'starter_echo',
        name: 'Starter',
        description: 'Quick entry balance injection.',
        price: 1.00,
        echoAmount: 250
    },
    {
        id: 'explorer_echo',
        name: 'Explorer',
        description: 'Fuel your journey.',
        price: 5.00,
        echoAmount: 1500,
        isPopular: true
    },
    {
        id: 'miner_echo',
        name: 'Miner',
        description: 'Serious voyager top-up.',
        price: 10.00,
        echoAmount: 3500
    },
    {
        id: 'whale_echo',
        name: 'Whale',
        description: 'Dominate the leaderboards.',
        price: 20.00,
        echoAmount: 7500
    },
    {
        id: 'legend_echo',
        name: 'Legend',
        description: 'Legendary status.',
        price: 50.00,
        echoAmount: 25000,
        badge: 'VIP'
    },
    {
        id: 'resonance_echo',
        name: 'Resonance',
        description: 'Absolute power & Priority.',
        price: 250.00,
        echoAmount: 150000,
        badge: 'VIP'
    }
];
}),
"[project]/lib/engine.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "EchoEngine",
    ()=>EchoEngine
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/constants.ts [app-route] (ecmascript)");
;
class EchoEngine {
    static recalculateRate(state, now) {
        if (!state.session.isActive) return;
        const refMult = 1 + state.user.referrals * 0.25;
        const adMult = state.activeBoosts.filter((b)=>b.type === 'AD' && b.expiresAt > now).reduce((acc, b)=>acc * b.multiplier, 1.0);
        const storeMult = state.activeBoosts.filter((b)=>b.type === 'STORE' && b.expiresAt > now).reduce((acc, b)=>acc * b.multiplier, 1.0);
        state.session.boostMultiplier = adMult * refMult;
        state.session.purchaseMultiplier = storeMult;
        state.session.effectiveRate = state.session.baseRate * state.session.streakMultiplier * adMult * refMult * storeMult;
    }
    static processMaintenance(state, now) {
        let changed = false;
        // 1. Filter out expired boosts
        const initialBoostCount = state.activeBoosts.length;
        state.activeBoosts = state.activeBoosts.filter((b)=>b.expiresAt > now);
        if (state.activeBoosts.length !== initialBoostCount) {
            changed = true;
            if (state.session.isActive) this.recalculateRate(state, now);
        }
        // 2. Settle sessions
        if (state.session.isActive && state.session.endTime && now >= state.session.endTime) {
            const durationSec = (state.session.endTime - (state.session.startTime || 0)) / 1000;
            const earnings = durationSec * state.session.effectiveRate;
            state.user.balance += earnings;
            state.user.totalMined += earnings;
            state.ledger.push({
                id: 'led_settle_' + now,
                timestamp: now,
                deltaEcho: earnings,
                reason: 'session_settlement',
                sessionId: state.session.id,
                hash: btoa(state.session.id + earnings)
            });
            state.streak.lastSessionEndAt = state.session.endTime;
            state.streak.graceEndsAt = state.session.endTime + __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["STREAK_GRACE_PERIOD_MS"];
            state.session.isActive = false;
            state.session.status = 'settled';
            state.notifications.unshift({
                id: 'notif_settle_' + now,
                type: 'session_end',
                title: 'Mining Complete',
                body: `Your cycle ended. Earned +${earnings.toFixed(4)} ECHO.`,
                createdAt: now,
                readAt: null
            });
            changed = true;
        }
        return changed;
    }
    static startSession(state, now) {
        if (state.session.isActive) throw new Error("Session already active");
        let newStreak = state.streak.currentStreak;
        if (state.streak.graceEndsAt && now > state.streak.graceEndsAt) newStreak = 1;
        else newStreak += 1;
        const streakMult = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["GET_STREAK_MULTIPLIER"])(newStreak);
        const sessionId = 'sess_' + now;
        state.session = {
            id: sessionId,
            isActive: true,
            startTime: now,
            endTime: now + __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["SESSION_DURATION_MS"],
            baseRate: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BASE_MINING_RATE"],
            streakMultiplier: streakMult,
            boostMultiplier: 1,
            purchaseMultiplier: 1,
            effectiveRate: 0,
            status: 'active'
        };
        this.recalculateRate(state, now);
        state.streak.currentStreak = newStreak;
        state.streak.lastSessionStartAt = now;
        state.streak.graceEndsAt = null;
        state.ledger.push({
            id: 'led_start_' + now,
            timestamp: now,
            deltaEcho: 0,
            reason: 'session_start',
            sessionId,
            hash: btoa('start' + sessionId + now)
        });
        return state;
    }
    static addAdBoost(state, now) {
        const existing = state.activeBoosts.find((b)=>b.type === 'AD' && b.expiresAt > now);
        let startAt = now;
        if (existing) {
            if (existing.expiresAt - now >= __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["AD_BOOST_MAX_QUEUE_MS"]) throw new Error("Boost queue full");
            startAt = existing.expiresAt;
            existing.expiresAt += __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["AD_BOOST_DURATION_MS"];
        } else {
            state.activeBoosts.push({
                id: 'boost_ad_' + now,
                type: 'AD',
                multiplier: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["AD_BOOST_MULTIPLIER"],
                startAt,
                expiresAt: startAt + __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["AD_BOOST_DURATION_MS"]
            });
        }
        state.ledger.push({
            id: 'led_boost_' + now,
            timestamp: now,
            deltaEcho: 0,
            reason: 'boost_activation',
            hash: btoa('boost' + now)
        });
        this.recalculateRate(state, now);
        return state;
    }
    static getSnapshotCSV(state) {
        const headers = "WalletAddress,EchoBalance,VerifiedAt,RiskScore,IsAdmin,PriorityAirdrop\n";
        const row = `${state.walletAddress || 'N/A'},${state.user.balance.toFixed(4)},${state.walletVerifiedAt ? new Date(state.walletVerifiedAt).toISOString() : 'N/A'},${state.user.riskScore},${state.user.isAdmin ? 'TRUE' : 'FALSE'},${state.user.priorityAirdrop ? 'TRUE' : 'FALSE'}\n`;
        return headers + row;
    }
    static processPurchase(state, sessionId, now) {
        const historyEntry = state.purchaseHistory.find((h)=>h.id === sessionId);
        if (!historyEntry || historyEntry.status === 'paid') return state;
        const item = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["STORE_ITEMS"].find((i)=>i.id === historyEntry.itemId);
        if (!item) return state;
        historyEntry.status = 'paid';
        if (item.echoAmount) {
            state.user.balance += item.echoAmount;
            state.ledger.push({
                id: 'led_purchase_' + now,
                timestamp: now,
                deltaEcho: item.echoAmount,
                reason: 'purchase_topup',
                hash: btoa(item.id + now)
            });
        }
        if (item.id === 'resonance_echo') state.user.priorityAirdrop = true;
        if (item.multiplier && item.multiplier > 1) {
            state.activeBoosts.push({
                id: 'boost_store_' + item.id + '_' + now,
                type: 'STORE',
                multiplier: item.multiplier,
                startAt: now,
                expiresAt: item.durationDays ? now + item.durationDays * 86400000 : now + 3153600000000,
                sourceRef: item.id
            });
        }
        this.recalculateRate(state, now);
        return state;
    }
}
}),
"[project]/app/api/mining/refresh/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/engine.ts [app-route] (ecmascript)");
;
;
async function POST(req) {
    const { state } = await req.json();
    const now = Date.now();
    __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["EchoEngine"].processMaintenance(state, now);
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(state);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__f2e2ac91._.js.map