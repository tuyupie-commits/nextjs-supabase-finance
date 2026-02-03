"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/utils/supabase/client";

type Tx = {
  id: string;
  created_at: string; // ✅ DB dùng created_at
  type: "income" | "expense";
  amount: number;
  category_id: string | null;
};

type Category = {
  id: string;
  name: string;
  kind: "income" | "expense"; // ✅ DB dùng kind
};

function ym(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `Tháng ${m}/${y}`;
}

function formatMoney(n: number) {
  return n.toLocaleString();
}

// (optional) nếu sau này muốn show ngày từ created_at
// function toYMD(iso: string) {
//   const d = new Date(iso);
//   if (Number.isNaN(d.getTime())) return iso;
//   return d.toISOString().slice(0, 10);
// }

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(ym());
  const [tx, setTx] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // ✅ range theo timestamp (created_at là timestamptz)
  const monthRange = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0);
    const end = new Date(y, m, 1, 0, 0, 0);
    return {
      startISO: start.toISOString(),
      endISO: end.toISOString(),
    };
  }, [month]);

  const income = useMemo(
    () =>
      tx.reduce((s, t) => s + (t.type === "income" ? Number(t.amount) : 0), 0),
    [tx],
  );
  const expense = useMemo(
    () =>
      tx.reduce((s, t) => s + (t.type === "expense" ? Number(t.amount) : 0), 0),
    [tx],
  );
  const net = income - expense;

  const spendRate = useMemo(() => {
    if (income <= 0) return 0;
    return Math.min(100, Math.round((expense / income) * 100));
  }, [income, expense]);

  // load household
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();

      if (uErr) {
        if (alive) setErr(uErr.message);
        if (alive) setLoading(false);
        return;
      }
      if (!user) {
        if (alive) setErr("Chưa đăng nhập");
        if (alive) setLoading(false);
        return;
      }

      const { data: mem, error: mErr } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (mErr) {
        if (alive) setErr(mErr.message);
        if (alive) setLoading(false);
        return;
      }

      const hh = (mem?.[0]?.household_id as string) ?? null;
      if (alive) setHouseholdId(hh);
      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ✅ load categories (expense only) -> kind
  useEffect(() => {
    if (!householdId) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,kind")
        .eq("household_id", householdId)
        .eq("kind", "expense");

      if (!alive) return;
      if (error) {
        setErr(error.message);
        return;
      }
      setCategories(((data as any) ?? []) as Category[]);
    })();

    return () => {
      alive = false;
    };
  }, [householdId]);

  // ✅ load tx + realtime -> created_at
  useEffect(() => {
    if (!householdId) return;
    let active = true;

    async function load() {
      const { data, error } = await supabase
        .from("transactions")
        .select("id,created_at,type,amount,category_id")
        .eq("household_id", householdId)
        .gte("created_at", monthRange.startISO)
        .lt("created_at", monthRange.endISO)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!active) return;
      if (error) {
        setErr(error.message);
        return;
      }
      setTx(((data as any) ?? []) as Tx[]);
    }

    load();

    const ch = supabase
      .channel(`dash:${householdId}:${month}`)
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
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [householdId, month, monthRange.startISO, monthRange.endISO]);

  // Top 3 danh mục chi
  const topExpenseCats = useMemo(() => {
    const sums = new Map<string, number>();

    for (const t of tx) {
      if (t.type !== "expense") continue;
      const key = t.category_id ?? "uncat";
      sums.set(key, (sums.get(key) ?? 0) + Number(t.amount));
    }

    const rows = Array.from(sums.entries()).map(([category_id, total]) => {
      const name =
        category_id === "uncat"
          ? "Không danh mục"
          : (categories.find((c) => c.id === category_id)?.name ?? "Danh mục");
      return { category_id, name, total };
    });

    rows.sort((a, b) => b.total - a.total);
    const top = rows.slice(0, 3);

    const max = top[0]?.total ?? 0;
    return top.map((r) => ({
      ...r,
      pct: max > 0 ? Math.round((r.total / max) * 100) : 0,
    }));
  }, [tx, categories]);

  if (loading) {
    return <div className="text-white/70">Đang tải dashboard...</div>;
  }

  if (!householdId) {
    return (
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold">Chào mừng bạn 👋</h1>
        <p className="text-sm text-white/70">
          Bạn chưa thuộc household nào. Hãy tạo household hoặc join bằng mã mời
          trong Settings.
        </p>
        <div className="flex gap-2">
          <Link
            className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
            href="/onboarding"
          >
            Tạo household
          </Link>
          <Link
            className="px-4 py-2 rounded border text-sm"
            href="/app/settings"
          >
            Join bằng mã mời
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="text-sm text-white/60">Dashboard</div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tổng quan {monthLabel(month)}
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Theo dõi thu/chi và nhịp tiêu dùng của gia đình.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-white/70">Tháng</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded p-2 bg-black/20 text-white"
          />
        </div>
      </div>

      {err && (
        <div className="border border-red-500/40 bg-red-500/10 rounded p-3 text-sm">
          Lỗi: {err}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Tổng thu</div>
          <div className="mt-2 text-2xl font-semibold text-green-200">
            {formatMoney(income)}
          </div>
          <div className="mt-2 text-xs text-white/50">
            Trong {monthLabel(month)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Tổng chi</div>
          <div className="mt-2 text-2xl font-semibold text-red-200">
            {formatMoney(expense)}
          </div>
          <div className="mt-2 text-xs text-white/50">
            Trong {monthLabel(month)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Còn lại</div>
          <div
            className={`mt-2 text-2xl font-semibold ${
              net >= 0 ? "text-white" : "text-red-200"
            }`}
          >
            {formatMoney(net)}
          </div>
          <div className="mt-2 text-xs text-white/50">
            {net >= 0 ? "Dư" : "Âm"} sau khi trừ chi
          </div>
        </div>
      </div>

      {/* Top 3 Expense Categories */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Top 3 danh mục chi</div>
            <div className="text-xs text-white/60 mt-1">
              Theo {monthLabel(month)}
            </div>
          </div>
          <Link
            href="/app/transactions"
            className="text-xs underline text-white/70"
          >
            Xem chi tiết
          </Link>
        </div>

        {topExpenseCats.length === 0 ? (
          <div className="mt-3 text-sm text-white/70">Chưa có dữ liệu chi.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {topExpenseCats.map((c) => (
              <div key={c.category_id} className="space-y-1">
                <div className="flex items-center justify-between text-sm gap-3">
                  <div className="text-white/80 truncate">{c.name}</div>
                  <div className="text-white font-semibold shrink-0">
                    {formatMoney(c.total)}
                  </div>
                </div>

                <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-red-300"
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="text-[11px] text-white/50">
              Thanh bar tính theo % so với danh mục chi lớn nhất trong top 3.
            </div>
          </div>
        )}
      </div>

      {/* Spend rate */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Tỷ lệ chi / thu</div>
            <div className="text-xs text-white/60 mt-1">
              {income === 0
                ? "Chưa có thu trong tháng này."
                : `Bạn đã chi ${spendRate}% so với tổng thu.`}
            </div>
          </div>
          <div className="text-xl font-semibold">{spendRate}%</div>
        </div>

        <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full ${
              spendRate >= 80
                ? "bg-red-400"
                : spendRate >= 50
                  ? "bg-yellow-300"
                  : "bg-green-300"
            }`}
            style={{ width: `${spendRate}%` }}
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-3 gap-3">
        <Link
          href="/app/transactions"
          className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"
        >
          <div className="text-sm font-medium">Ghi thu/chi</div>
          <div className="text-xs text-white/60 mt-1">
            Thêm giao dịch và xem realtime.
          </div>
          <div className="mt-3 text-xs underline text-white/80">
            Mở Transactions
          </div>
        </Link>

        <Link
          href="/app/budgets"
          className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"
        >
          <div className="text-sm font-medium">Ngân sách</div>
          <div className="text-xs text-white/60 mt-1">
            Thiết lập hạn mức theo tháng.
          </div>
          <div className="mt-3 text-xs underline text-white/80">Mở Budgets</div>
        </Link>

        <Link
          href="/app/settings"
          className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"
        >
          <div className="text-sm font-medium">Cài đặt & mã mời</div>
          <div className="text-xs text-white/60 mt-1">
            Tạo / nhập mã mời, quản lý household.
          </div>
          <div className="mt-3 text-xs underline text-white/80">
            Mở Settings
          </div>
        </Link>
      </div>

      <div className="text-xs text-white/50">
        Tip: Mở trang Transactions trên 2 thiết bị cùng household để thấy
        realtime cập nhật.
      </div>
    </div>
  );
}
