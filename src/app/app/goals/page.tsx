"use client";

import { supabase } from "@/utils/supabase/client";
import { useEffect, useMemo, useState, useTransition } from "react";

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  deadline: string | null; // ✅ DB dùng deadline (date)
  current_amount: number; // ✅ có trong DB
  is_completed: boolean; // ✅ có trong DB
};

function ym(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function GoalsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [month, setMonth] = useState(ym());
  const [net, setNet] = useState<number>(0);

  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [target, setTarget] = useState<number>(0);
  const [date, setDate] = useState<string>(""); // UI date -> map sang deadline

  // ✅ range theo created_at (timestamptz)
  const monthRange = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0);
    const end = new Date(y, m, 1, 0, 0, 0);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [month]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      setHouseholdId((data?.[0]?.household_id as string) ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!householdId) return;

    let alive = true;

    async function load() {
      // ✅ goals dùng deadline, current_amount, is_completed
      const { data: g, error: gErr } = await supabase
        .from("goals")
        .select("id,name,target_amount,deadline,current_amount,is_completed")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (gErr) {
        // bạn có thể alert hoặc setErr nếu muốn
        console.error(gErr);
      }
      setGoals((g as any) ?? []);

      // ✅ transactions lọc theo created_at (không có date)
      const { data: t, error: tErr } = await supabase
        .from("transactions")
        .select("amount,type,created_at")
        .eq("household_id", householdId)
        .gte("created_at", monthRange.startISO)
        .lt("created_at", monthRange.endISO);

      if (!alive) return;
      if (tErr) {
        console.error(tErr);
        return;
      }

      const income = ((t as any[]) ?? []).reduce(
        (s, r) => s + (r.type === "income" ? Number(r.amount) : 0),
        0,
      );
      const expense = ((t as any[]) ?? []).reduce(
        (s, r) => s + (r.type === "expense" ? Number(r.amount) : 0),
        0,
      );
      setNet(income - expense);
    }

    load();

    const ch = supabase
      .channel(`goals:${householdId}:${month}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "goals",
          filter: `household_id=eq.${householdId}`,
        },
        () => load(),
      )
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
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [householdId, month, monthRange.startISO, monthRange.endISO]);

  const monthLabel = useMemo(() => month, [month]);

  function addGoal() {
    if (!householdId) return;
    if (!name.trim()) return alert("Nhập tên mục tiêu");
    if (!target || target <= 0) return alert("Target phải > 0");

    startTransition(async () => {
      // ✅ insert đúng schema: deadline, current_amount, is_completed
      const { error } = await supabase.from("goals").insert({
        household_id: householdId,
        name: name.trim(),
        target_amount: target,
        deadline: date ? date : null, // ✅ deadline (date)
        current_amount: 0,
        is_completed: false,
        // wallet_id: null, // (tùy bạn, vì DB có cột này)
      });

      if (error) return alert(error.message);
      setName("");
      setTarget(0);
      setDate("");
    });
  }

  async function removeGoal(id: string) {
    if (!confirm("Xoá mục tiêu này?")) return;

    const { error } = await supabase
      .from("goals")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId!);

    if (error) alert(error.message);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-semibold">Goals</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border rounded p-2 bg-black/20 text-white"
        />
      </div>

      <div className="border rounded p-4 bg-white/5">
        <div className="text-sm text-white/70">
          Tiết kiệm tạm tính tháng {monthLabel}
        </div>
        <div className="text-2xl font-semibold">{net.toLocaleString()}</div>
      </div>

      <div className="border rounded p-4 bg-white/5 space-y-2">
        <div className="font-medium">Tạo mục tiêu</div>
        <div className="grid md:grid-cols-3 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên mục tiêu"
            className="border rounded p-2 bg-black/20 text-white"
          />
          <input
            value={target || ""}
            onChange={(e) => setTarget(Number(e.target.value || 0))}
            type="number"
            placeholder="Target"
            className="border rounded p-2 bg-black/20 text-white"
          />
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            type="date"
            className="border rounded p-2 bg-black/20 text-white"
          />
        </div>
        <button
          disabled={pending}
          onClick={addGoal}
          className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
        >
          {pending ? "Đang tạo..." : "Tạo mục tiêu"}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {goals.map((g) => {
          const pct =
            g.target_amount > 0
              ? Math.min(100, Math.round((net / g.target_amount) * 100))
              : 0;

          return (
            <div key={g.id} className="border rounded p-4 bg-white/5 space-y-2">
              <div className="flex justify-between">
                <div className="font-semibold">{g.name}</div>
                <button
                  className="text-xs underline text-red-300"
                  onClick={() => removeGoal(g.id)}
                >
                  Xoá
                </button>
              </div>

              <div className="text-sm text-white/70">
                Target:{" "}
                <b className="text-white">
                  {Number(g.target_amount).toLocaleString()}
                </b>
                {g.deadline ? (
                  <>
                    {" "}
                    • Hạn: <b className="text-white">{g.deadline}</b>
                  </>
                ) : null}
              </div>

              <div className="text-sm">
                Progress (tạm tính): <b>{net.toLocaleString()}</b> ({pct}%)
              </div>

              <div className="h-2 bg-white/10 rounded overflow-hidden">
                <div
                  className="h-2 bg-green-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
