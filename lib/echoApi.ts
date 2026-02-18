export const EchoAPI = {
  async startMining(baseRatePerHr: number, multiplier = 1) {
    const res = await fetch("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // ✅ sends session cookie
      body: JSON.stringify({ baseRatePerHr, multiplier }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Start mining failed");
    }
    return res.json();
  },

  async refreshMining() {
    const res = await fetch("/api/mining/refresh", {
      method: "POST",
      credentials: "include", // ✅ sends session cookie
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Refresh mining failed");
    }
    return res.json();
  },
};
