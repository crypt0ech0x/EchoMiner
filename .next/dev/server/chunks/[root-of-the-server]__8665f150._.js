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
"[project]/app/api/state/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/constants.ts [app-route] (ecmascript)");
;
;
async function POST(req) {
    const { state } = await req.json();
    if (!state) {
        const now = Date.now();
        const refCode = 'ECHO' + Math.floor(1000 + Math.random() * 9000);
        const newState = {
            user: {
                id: 'user_' + Math.random().toString(36).substr(2, 9),
                username: refCode,
                balance: 0,
                totalMined: 0,
                referrals: 0,
                joinedDate: now,
                guest: true,
                riskScore: 0,
                referralCode: refCode,
                isAdmin: false,
                priorityAirdrop: false,
                notificationPreferences: {
                    session_end: true,
                    streak_grace_warning: true,
                    boost_expired: true,
                    weekly_summary: true,
                    airdrop_announcement: true
                }
            },
            streak: {
                currentStreak: 0,
                lastSessionStartAt: null,
                lastSessionEndAt: null,
                graceEndsAt: null
            },
            session: {
                id: '',
                isActive: false,
                startTime: null,
                endTime: null,
                baseRate: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$constants$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BASE_MINING_RATE"],
                streakMultiplier: 1,
                boostMultiplier: 1,
                purchaseMultiplier: 1,
                effectiveRate: 0,
                status: 'ended'
            },
            activeBoosts: [],
            ledger: [],
            purchaseHistory: [],
            notifications: [],
            walletAddress: null,
            walletVerifiedAt: null,
            currentNonce: null
        };
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(newState);
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(state);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__8665f150._.js.map