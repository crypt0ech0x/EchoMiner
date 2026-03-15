import { prisma } from "@/lib/prisma";
import { getStorePackage } from "@/lib/store-packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  purchaseId?: string;
  txSignature?: string;
};

async function recoverPurchase(purchaseId: string, txSignature: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
  });

  if (!purchase) {
    return { ok: false, status: 404, error: "Purchase not found" };
  }

  if (purchase.status === "confirmed") {
    return { ok: true, status: 200, message: "Purchase already confirmed" };
  }

  const pkg = getStorePackage(purchase.packageId);

  if (!pkg) {
    return { ok: false, status: 500, error: "Package not found" };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: "confirmed",
        txSignature,
        confirmedAt: now,
      },
    });

    await tx.user.update({
      where: { id: purchase.userId },
      data: {
        totalPurchasedEcho: {
          increment: pkg.echoAmount,
        },
      },
    });

    await tx.ledgerEntry.create({
      data: {
        userId: purchase.userId,
        type: "purchase_credit",
        amountEcho: pkg.echoAmount,
        sourceType: "purchase",
        sourceId: purchase.id,
        metadataJson: {
          packageId: pkg.id,
          solAmount: pkg.solAmount,
          txSignature,
          recovered: true,
        },
      },
    });
  });

  return {
    ok: true,
    status: 200,
    recovered: true,
    echoAmount: pkg.echoAmount,
    purchaseId,
    txSignature,
  };
}

export async function GET() {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Recover Purchase</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #0b1020;
            color: white;
            padding: 24px;
            max-width: 560px;
            margin: 0 auto;
          }
          input, button, textarea {
            width: 100%;
            box-sizing: border-box;
            margin-top: 12px;
            padding: 14px;
            border-radius: 12px;
            border: 1px solid #334155;
            background: #111827;
            color: white;
          }
          button {
            background: #10b981;
            border: none;
            font-weight: bold;
          }
          pre {
            white-space: pre-wrap;
            background: #111827;
            padding: 16px;
            border-radius: 12px;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <h1>Recover Purchase</h1>
        <p>Use only for a purchase that already succeeded on-chain.</p>
        <input id="purchaseId" placeholder="Purchase ID" />
        <input id="txSignature" placeholder="Transaction Signature" />
        <button onclick="submitForm()">Recover Purchase</button>
        <pre id="result"></pre>

        <script>
          async function submitForm() {
            const purchaseId = document.getElementById("purchaseId").value.trim();
            const txSignature = document.getElementById("txSignature").value.trim();
            const result = document.getElementById("result");

            result.textContent = "Processing...";

            const res = await fetch("/api/admin/recover-purchase", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ purchaseId, txSignature })
            });

            const json = await res.json().catch(() => ({ ok: false, error: "Invalid response" }));
            result.textContent = JSON.stringify(json, null, 2);
          }
        </script>
      </body>
    </html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const purchaseId = String(body.purchaseId ?? "").trim();
    const txSignature = String(body.txSignature ?? "").trim();

    if (!purchaseId || !txSignature) {
      return Response.json(
        { ok: false, error: "Missing purchaseId or txSignature" },
        { status: 400 }
      );
    }

    const result = await recoverPurchase(purchaseId, txSignature);

    return Response.json(result, { status: result.status });
  } catch (err: any) {
    console.error("recover purchase error:", err);
    return Response.json(
      { ok: false, error: err?.message || "Recovery failed" },
      { status: 500 }
    );
  }
}