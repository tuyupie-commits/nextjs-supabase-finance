"use client";

import { supabase } from "@/utils/supabase/client";
import { useEffect, useMemo, useState, useTransition } from "react";

type Wallet = {
  id: string;
  household_id: string;
  name: string;
  currency_code: string;
  is_primary: boolean;
  created_at: string;
};

function currencyLabel(code: string) {
  if (code === "VND") return "VND - Việt Nam Đồng";
  if (code === "USD") return "USD - US Dollar";
  if (code === "KRW") return "KRW - Korean Won";
  return code;
}

export default function WalletsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [pending, startTransition] = useTransition();

  // form create
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<"VND" | "USD" | "KRW">("VND");
  const [makePrimary, setMakePrimary] = useState(false);

  const primary = useMemo(() => wallets.find((w) => w.is_primary), [wallets]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();
      if (uErr) {
        setErr(uErr.message);
        setLoading(false);
        return;
      }
      if (!user) {
        setErr("Chưa đăng nhập");
        setLoading(false);
        return;
      }

      const { data: mem, error: mErr } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (mErr) {
        setErr(mErr.message);
        setLoading(false);
        return;
      }

      const hh = (mem?.[0]?.household_id as string) ?? null;
      setHouseholdId(hh);
      setLoading(false);
    })();
  }, []);

  async function loadWallets(hh: string) {
    const { data, error } = await supabase
      .from("wallets")
      .select("id, household_id, name, currency_code, is_primary, created_at")
      .eq("household_id", hh)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      setErr(error.message);
      return;
    }
    setWallets((data as any) ?? []);
  }

  useEffect(() => {
    if (!householdId) return;

    loadWallets(householdId);

    // realtime wallets
    const ch = supabase
      .channel(`wallets:${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `household_id=eq.${householdId}`,
        },
        () => loadWallets(householdId),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [householdId]);

  function createWallet() {
    if (!householdId) return;
    if (!name.trim()) return alert("Nhập tên ví");

    startTransition(async () => {
      try {
        setErr(null);

        // nếu chọn makePrimary -> set tất cả ví khác is_primary=false trước
        if (makePrimary) {
          const { error: upErr } = await supabase
            .from("wallets")
            .update({ is_primary: false })
            .eq("household_id", householdId);
          if (upErr) throw upErr;
        }

        const { error } = await supabase.from("wallets").insert({
          household_id: householdId,
          name: name.trim(),
          currency_code: currency,
          is_primary: makePrimary || wallets.length === 0, // ví đầu tiên auto primary
        });
        if (error) throw error;

        setName("");
        setCurrency("VND");
        setMakePrimary(false);
      } catch (e: any) {
        alert(e?.message ?? "Tạo ví thất bại");
      }
    });
  }

  function setPrimaryWallet(id: string) {
    if (!householdId) return;
    startTransition(async () => {
      try {
        setErr(null);
        // set all false
        const { error: e1 } = await supabase
          .from("wallets")
          .update({ is_primary: false })
          .eq("household_id", householdId);
        if (e1) throw e1;

        // set chosen true
        const { error: e2 } = await supabase
          .from("wallets")
          .update({ is_primary: true })
          .eq("household_id", householdId)
          .eq("id", id);
        if (e2) throw e2;
      } catch (e: any) {
        alert(e?.message ?? "Không set được ví chính");
      }
    });
  }

  async function deleteWallet(id: string) {
    if (!householdId) return;
    const w = wallets.find((x) => x.id === id);
    if (!w) return;
    if (w.is_primary)
      return alert("Không thể xoá ví chính. Hãy đổi ví chính trước.");

    if (!confirm(`Xoá ví "${w.name}"?`)) return;

    // chặn nếu đang có transactions dùng ví
    const { count, error: cErr } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("wallet_id", id);

    if (cErr) return alert(cErr.message);
    if ((count ?? 0) > 0)
      return alert("Ví này đang có giao dịch, không thể xoá.");

    const { error } = await supabase
      .from("wallets")
      .delete()
      .eq("household_id", householdId)
      .eq("id", id);

    if (error) alert(error.message);
  }

  if (loading) return <div className="text-sm text-white/70">Đang tải...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Wallets</h1>
          <div className="text-sm text-white/60">
            Ví chính: <b className="text-white">{primary?.name ?? "-"}</b>
          </div>
        </div>
      </div>

      {err && (
        <div className="border border-red-500/40 bg-red-500/10 rounded p-3 text-sm">
          {err}
        </div>
      )}

      {/* Create wallet */}
      <div className="border rounded p-4 bg-white/5 space-y-3">
        <div className="font-medium">Tạo ví mới</div>

        <div className="grid md:grid-cols-3 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên ví (vd. Ví chính / Tiền mặt / Ngân hàng)"
            className="border rounded p-2 bg-black/20 text-white"
          />

          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as any)}
            className="border rounded p-2 bg-black/20 text-white"
          >
            <option value="VND">{currencyLabel("VND")}</option>
            <option value="USD">{currencyLabel("USD")}</option>
            <option value="KRW">{currencyLabel("KRW")}</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={makePrimary}
              onChange={(e) => setMakePrimary(e.target.checked)}
            />
            Đặt làm ví chính
          </label>
        </div>

        <button
          onClick={createWallet}
          disabled={pending || !householdId}
          className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
        >
          {pending ? "Đang tạo..." : "Tạo ví"}
        </button>

        <div className="text-xs text-white/50">
          Tip: Ví đầu tiên sẽ tự động là ví chính.
        </div>
      </div>

      {/* List */}
      <div className="border rounded overflow-hidden">
        <div className="px-3 py-2 text-xs text-white/60 bg-white/5">
          Danh sách ví
        </div>

        {wallets.length === 0 ? (
          <div className="p-4 text-sm text-white/70">Chưa có ví nào.</div>
        ) : (
          <ul>
            {wallets.map((w) => (
              <li key={w.id} className="p-3 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {w.name}
                      {w.is_primary && (
                        <span className="text-xs px-2 py-1 rounded bg-white text-black">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-white/60">
                      {currencyLabel(w.currency_code)}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    {!w.is_primary && (
                      <button
                        onClick={() => setPrimaryWallet(w.id)}
                        className="underline text-white/80"
                      >
                        Đặt chính
                      </button>
                    )}
                    {!w.is_primary && (
                      <button
                        onClick={() => deleteWallet(w.id)}
                        className="underline text-red-300"
                      >
                        Xoá
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
