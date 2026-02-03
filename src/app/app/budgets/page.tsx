"use client";

import { supabase } from "@/utils/supabase/client";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  useCallback,
} from "react";

function ym(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ym = "2026-01" -> "2026-01-01" (DATE)
function toMonthKey(ymStr: string) {
  return `${ymStr}-01`;
}

export default function BudgetsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [month, setMonth] = useState(ym());

  // ✅ dùng string để giữ số 0 đầu
  const [limitText, setLimitText] = useState<string>("0");
  const limit = useMemo(() => Number(limitText || 0), [limitText]);

  const [spent, setSpent] = useState<number>(0);

  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const pct = useMemo(
    () => (limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0),
    [spent, limit],
  );

  // range theo created_at (timestamptz)
  const monthRange = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0);
    const end = new Date(y, m, 1, 0, 0, 0);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [month]);

  // load household
  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();

      if (!alive) return;

      if (uErr) {
        setErr(uErr.message);
        return;
      }
      if (!user) return;

      const { data, error } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (!alive) return;

      if (error) {
        setErr(error.message);
        return;
      }

      setHouseholdId((data?.[0]?.household_id as string) ?? null);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!householdId) return;
    setErr(null);

    const month_key = toMonthKey(month);

    // ✅ Không dùng single/maybeSingle để tránh lỗi multiple rows
    // Lấy dòng mới nhất của "tổng tháng" (category_id IS NULL)
    const { data: rows, error: bErr } = await supabase
      .from("budgets")
      .select("id,amount,created_at")
      .eq("household_id", householdId)
      .eq("month_key", month_key)
      .is("category_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (bErr) {
      setErr(bErr.message);
    } else {
      const amount = Number(rows?.[0]?.amount ?? 0);
      setLimitText(String(amount)); // hiển thị đúng
    }

    // ✅ tính spent từ transactions trong tháng (created_at)
    const { data: t, error: tErr } = await supabase
      .from("transactions")
      .select("amount,type")
      .eq("household_id", householdId)
      .gte("created_at", monthRange.startISO)
      .lt("created_at", monthRange.endISO);

    if (tErr) {
      setErr(tErr.message);
      return;
    }

    const s = ((t as any[]) ?? []).reduce(
      (acc, r) => acc + (r.type === "expense" ? Number(r.amount) : 0),
      0,
    );
    setSpent(s);
  }, [householdId, month, monthRange.startISO, monthRange.endISO]);

  // load data + realtime
  useEffect(() => {
    if (!householdId) return;
    let alive = true;

    (async () => {
      if (!alive) return;
      await load();
    })();

    const ch = supabase
      .channel(`bud:${householdId}:${month}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `household_id=eq.${householdId}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "budgets",
          filter: `household_id=eq.${householdId}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [householdId, month, load]);

  function save() {
    if (!householdId) return;

    startTransition(async () => {
      try {
        setErr(null);

        const month_key = toMonthKey(month);
        const newLimit = Number(limitText || 0);

        if (!Number.isFinite(newLimit) || newLimit < 0) {
          setErr("Ngân sách không hợp lệ");
          return;
        }

        // ✅ tìm dòng tổng tháng (category_id null) mới nhất
        const { data: existRows, error: findErr } = await supabase
          .from("budgets")
          .select("id,created_at")
          .eq("household_id", householdId)
          .eq("month_key", month_key)
          .is("category_id", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (findErr) throw new Error(findErr.message);

        const existingId = existRows?.[0]?.id as string | undefined;

        if (existingId) {
          const { error: upErr } = await supabase
            .from("budgets")
            .update({ amount: newLimit })
            .eq("id", existingId);

          if (upErr) throw new Error(upErr.message);
        } else {
          const { error: insErr } = await supabase.from("budgets").insert({
            household_id: householdId,
            month_key,
            category_id: null,
            amount: newLimit,
          });

          if (insErr) throw new Error(insErr.message);
        }

        // ✅ cập nhật UI ngay
        setLimitText(String(newLimit));
        await load();
      } catch (e: any) {
        setErr(e?.message ?? "Lưu thất bại");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-semibold">Budgets</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border rounded p-2 bg-black/20 text-white"
        />
      </div>

      {err && (
        <div className="border border-red-500/40 bg-red-500/10 rounded p-3 text-sm">
          Lỗi: {err}
        </div>
      )}

      <div className="border rounded p-4 bg-white/5 space-y-2">
        <div className="text-sm text-white/70">Ngân sách tổng tháng</div>

        <div className="flex gap-2 items-center">
          {/* ✅ giữ số 0 đầu */}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={limitText}
            onChange={(e) =>
              setLimitText(e.target.value.replace(/\D/g, "") || "0")
            }
            className="border rounded p-2 bg-black/20 text-white w-56"
          />

          <button
            disabled={pending}
            onClick={save}
            className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
          >
            {pending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>

        <div className="text-sm">
          Đã chi: <b>{spent.toLocaleString()}</b> /{" "}
          <b>{limit.toLocaleString()}</b> ({pct}%)
        </div>

        <div className="h-2 bg-white/10 rounded overflow-hidden">
          <div className="h-2 bg-red-400" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
