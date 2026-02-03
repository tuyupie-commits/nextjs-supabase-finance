"use client";

import { supabase } from "@/utils/supabase/client";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  useCallback,
} from "react";
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from "./actions";
import * as XLSX from "xlsx";

type Tx = {
  id: string;
  created_at: string; // ✅ DB dùng created_at
  type: "income" | "expense";
  amount: number;
  note: string | null;
  wallet_id: string | null;
  category_id: string | null;
};

type Wallet = {
  id: string;
  name: string;
  currency_code: string;
  is_primary: boolean;
};

type Category = {
  id: string;
  name: string;
  kind: "income" | "expense"; // ✅ DB dùng kind
};

function ym(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toYMD(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function SwipeRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const THRESHOLD = -80;
  const MAX = -120;

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 w-24 bg-red-600 flex items-center justify-center">
        <button onClick={onDelete} className="text-white text-sm font-semibold">
          Xoá
        </button>
      </div>

      <div
        className="relative bg-black touch-pan-y"
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={(e) => {
          setDragging(true);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const movementX = (e as any).movementX ?? 0;
          setDx((prev) => Math.max(MAX, Math.min(0, prev + movementX)));
        }}
        onPointerUp={() => {
          setDragging(false);
          setDx((prev) => (prev < THRESHOLD ? THRESHOLD : 0));
        }}
        onPointerCancel={() => {
          setDragging(false);
          setDx(0);
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [items, setItems] = useState<Tx[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [month, setMonth] = useState<string>(ym());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Tx | null>(null);

  // FAB + modal add (mobile)
  const [showAdd, setShowAdd] = useState(false);

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

  // ✅ reload list (dùng cho realtime + fallback sau add/update/delete)
  const reload = useCallback(async () => {
    if (!householdId) return;

    const { data, error } = await supabase
      .from("transactions")
      .select("id,created_at,type,amount,note,wallet_id,category_id")
      .eq("household_id", householdId)
      .gte("created_at", monthRange.startISO)
      .lt("created_at", monthRange.endISO)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setItems(((data as any) ?? []) as Tx[]);
  }, [householdId, monthRange.startISO, monthRange.endISO]);

  const totalExpense = useMemo(
    () =>
      items.reduce(
        (s, t) => s + (t.type === "expense" ? Number(t.amount) : 0),
        0,
      ),
    [items],
  );
  const totalIncome = useMemo(
    () =>
      items.reduce(
        (s, t) => s + (t.type === "income" ? Number(t.amount) : 0),
        0,
      ),
    [items],
  );

  // load household
  useEffect(() => {
    let alive = true;
    (async () => {
      setErrorMsg(null);
      setLoading(true);

      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();

      if (uErr) {
        if (alive) setErrorMsg(uErr.message);
        if (alive) setLoading(false);
        return;
      }
      if (!user) {
        if (alive) setErrorMsg("Chưa đăng nhập");
        if (alive) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) {
        if (alive) setErrorMsg(error.message);
        if (alive) setLoading(false);
        return;
      }

      const hh = (data?.[0]?.household_id as string) ?? null;
      if (alive) setHouseholdId(hh);
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // load wallets/categories
  useEffect(() => {
    if (!householdId) return;

    (async () => {
      setErrorMsg(null);

      const { data: w, error: wErr } = await supabase
        .from("wallets")
        .select("id,name,currency_code,is_primary")
        .eq("household_id", householdId)
        .order("is_primary", { ascending: false });

      if (wErr) setErrorMsg(wErr.message);
      else setWallets((w as any) ?? []);

      const { data: c, error: cErr } = await supabase
        .from("categories")
        .select("id,name,kind")
        .eq("household_id", householdId)
        .order("created_at", { ascending: true });

      if (cErr) setErrorMsg(cErr.message);
      else setCategories(((c as any) ?? []) as Category[]);
    })();
  }, [householdId]);

  // load list + realtime (realtime gọi reload)
  useEffect(() => {
    if (!householdId) return;
    let active = true;

    async function safeReload() {
      if (!active) return;
      await reload();
    }

    safeReload();

    const channel = supabase
      .channel(`tx:${householdId}:${month}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `household_id=eq.${householdId}`,
        },
        () => safeReload(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [householdId, month, reload]);

  const primaryWalletId = useMemo(
    () => wallets.find((w) => w.is_primary)?.id ?? wallets[0]?.id ?? "",
    [wallets],
  );

  // ✅ add -> reload
  function onAdd(fd: FormData) {
    startTransition(async () => {
      try {
        await addTransaction(fd);
        await reload(); // ✅ quan trọng: cập nhật ngay không cần F5
      } catch (e: any) {
        alert(e?.message ?? "Add failed");
      }
    });
  }

  // ✅ update -> reload
  function onUpdate(fd: FormData) {
    startTransition(async () => {
      try {
        await updateTransaction(fd);
        setEditing(null);
        await reload(); // ✅
      } catch (e: any) {
        alert(e?.message ?? "Update failed");
      }
    });
  }

  // ✅ delete -> reload
  function onDelete(id: string) {
    if (!confirm("Xoá giao dịch này?")) return;
    const fd = new FormData();
    fd.set("id", id);

    startTransition(async () => {
      try {
        await deleteTransaction(fd);
        await reload(); // ✅
      } catch (e: any) {
        alert(e?.message ?? "Delete failed");
      }
    });
  }

  function exportExcel() {
    if (!items.length) {
      alert("Không có dữ liệu để xuất");
      return;
    }

    const data = items.map((t) => {
      const cat = categories.find((c) => c.id === t.category_id);
      const wal = wallets.find((w) => w.id === t.wallet_id);

      return {
        Date: toYMD(t.created_at),
        Type: t.type === "expense" ? "Chi" : "Thu",
        Amount: t.amount,
        Currency: wal?.currency_code ?? "",
        Category: cat?.name ?? "",
        Wallet: wal?.name ?? "",
        Note: t.note ?? "",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    XLSX.writeFile(workbook, `transactions-${month}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Transactions</h1>
          <div className="text-sm text-white/70">
            Thu: <b className="text-white">{totalIncome.toLocaleString()}</b> •
            Chi: <b className="text-white">{totalExpense.toLocaleString()}</b> •
            Còn lại:{" "}
            <b className="text-white">
              {(totalIncome - totalExpense).toLocaleString()}
            </b>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-white/70">Tháng</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded p-2 bg-black/20 text-white"
          />

          <button
            onClick={exportExcel}
            className="px-3 py-2 rounded border text-sm text-white/80 hover:bg-white/10"
          >
            Xuất Excel
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-white/70">Đang tải household...</p>
      )}
      {errorMsg && (
        <div className="border border-red-500/40 bg-red-500/10 rounded p-3 text-sm">
          Lỗi: {errorMsg}
        </div>
      )}

      {/* ADD FORM (desktop only) */}
      <form
        action={onAdd}
        className="hidden md:grid grid-cols-12 gap-2 border rounded p-3 bg-white/5"
      >
        {/* created_at: để server action đọc nếu bạn muốn (không bắt buộc nếu DB default now()) */}
        <input
          type="hidden"
          name="created_at"
          value={new Date().toISOString()}
        />

        <div className="col-span-12 md:col-span-2">
          <select
            name="type"
            className="w-full border rounded p-2 bg-black/20 text-white"
            defaultValue="expense"
          >
            <option value="expense">Chi</option>
            <option value="income">Thu</option>
          </select>
        </div>

        <div className="col-span-12 md:col-span-3">
          <select
            name="category_id"
            className="w-full border rounded p-2 bg-black/20 text-white"
            defaultValue=""
          >
            <option value="">(Không chọn danh mục)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} • {c.kind}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-12 md:col-span-3">
          <select
            name="wallet_id"
            className="w-full border rounded p-2 bg-black/20 text-white"
            defaultValue={primaryWalletId}
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.currency_code})
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-12 md:col-span-2">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="Số tiền"
            className="w-full border rounded p-2 bg-black/20 text-white placeholder:text-white/60"
          />
        </div>

        <div className="col-span-12 md:col-span-2">
          <input
            name="note"
            placeholder="Ghi chú"
            className="w-full border rounded p-2 bg-black/20 text-white placeholder:text-white/60"
          />
        </div>

        <div className="col-span-12 flex justify-end">
          <button
            disabled={pending || !householdId}
            className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
          >
            {pending ? "Đang thêm..." : "Thêm"}
          </button>
        </div>
      </form>

      {/* LIST (desktop/table-like) */}
      <div className="hidden md:block border rounded overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-white/60 bg-white/5">
          <div className="col-span-2">Ngày</div>
          <div className="col-span-2">Loại</div>
          <div className="col-span-3">Danh mục</div>
          <div className="col-span-2">Ví</div>
          <div className="col-span-2 text-right">Số tiền</div>
          <div className="col-span-1 text-right">...</div>
        </div>

        {items.length === 0 ? (
          <div className="p-4 text-sm text-white/70">
            Chưa có giao dịch trong tháng này.
          </div>
        ) : (
          <ul>
            {items.map((t) => {
              const cat = categories.find((c) => c.id === t.category_id);
              const wal = wallets.find((w) => w.id === t.wallet_id);

              return (
                <li
                  key={t.id}
                  className="grid grid-cols-12 gap-2 px-3 py-3 border-t border-white/10 items-center"
                >
                  <div className="col-span-2 text-sm">
                    {toYMD(t.created_at)}
                  </div>

                  <div className="col-span-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        t.type === "expense"
                          ? "bg-red-500/20 text-red-200"
                          : "bg-green-500/20 text-green-200"
                      }`}
                    >
                      {t.type}
                    </span>
                  </div>

                  <div className="col-span-3 text-sm text-white/80">
                    {cat?.name ?? "-"}
                  </div>

                  <div className="col-span-2 text-sm text-white/80">
                    {wal?.name ?? "-"}
                  </div>

                  <div className="col-span-2 text-right font-semibold">
                    {Number(t.amount).toLocaleString()}
                  </div>

                  <div className="col-span-1 text-right space-x-2">
                    <button
                      className="text-xs underline text-white/80"
                      onClick={() => setEditing(t)}
                    >
                      Sửa
                    </button>
                    <button
                      className="text-xs underline text-red-300"
                      onClick={() => onDelete(t.id)}
                    >
                      Xoá
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* LIST (mobile/cards) */}
      <div className="md:hidden border rounded overflow-hidden">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-white/70">
            Chưa có giao dịch trong tháng này.
          </div>
        ) : (
          <ul>
            {items.map((t) => {
              const cat = categories.find((c) => c.id === t.category_id);
              const wal = wallets.find((w) => w.id === t.wallet_id);

              return (
                <SwipeRow key={t.id} onDelete={() => onDelete(t.id)}>
                  <li className="p-3 border-t border-white/10">
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-white/80">
                        {toYMD(t.created_at)}
                      </div>
                      <div className="font-semibold">
                        {Number(t.amount).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-1">
                      <div className="text-xs text-white/60">
                        {cat?.name ?? "No category"} •{" "}
                        {wal?.name ?? "No wallet"}
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          t.type === "expense"
                            ? "bg-red-500/20 text-red-200"
                            : "bg-green-500/20 text-green-200"
                        }`}
                      >
                        {t.type === "expense" ? "Chi" : "Thu"}
                      </span>
                    </div>

                    {t.note && (
                      <div className="text-sm text-white/70 mt-1">{t.note}</div>
                    )}

                    <div className="flex justify-end gap-4 mt-2 text-xs">
                      <button
                        className="underline text-white/80"
                        onClick={() => setEditing(t)}
                      >
                        Sửa
                      </button>
                    </div>
                  </li>
                </SwipeRow>
              );
            })}
          </ul>
        )}
      </div>

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg border rounded bg-neutral-950 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Sửa giao dịch</h2>
              <button
                className="text-sm underline"
                onClick={() => setEditing(null)}
              >
                Đóng
              </button>
            </div>

            <form action={onUpdate} className="grid grid-cols-12 gap-2">
              <input type="hidden" name="id" value={editing.id} />
              <input
                type="hidden"
                name="created_at"
                value={editing.created_at}
              />

              <div className="col-span-12">
                <label className="text-xs text-white/60">Ngày</label>
                <input
                  readOnly
                  value={toYMD(editing.created_at)}
                  className="w-full border rounded p-2 bg-black/20 text-white/70"
                />
              </div>

              <div className="col-span-6">
                <label className="text-xs text-white/60">Loại</label>
                <select
                  name="type"
                  defaultValue={editing.type}
                  className="w-full border rounded p-2 bg-black/20 text-white"
                >
                  <option value="expense">Chi</option>
                  <option value="income">Thu</option>
                </select>
              </div>

              <div className="col-span-6">
                <label className="text-xs text-white/60">Số tiền</label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editing.amount}
                  className="w-full border rounded p-2 bg-black/20 text-white"
                />
              </div>

              <div className="col-span-12">
                <label className="text-xs text-white/60">Danh mục</label>
                <select
                  name="category_id"
                  defaultValue={editing.category_id ?? ""}
                  className="w-full border rounded p-2 bg-black/20 text-white"
                >
                  <option value="">(Không chọn)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} • {c.kind}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12">
                <label className="text-xs text-white/60">Ví</label>
                <select
                  name="wallet_id"
                  defaultValue={editing.wallet_id ?? primaryWalletId}
                  className="w-full border rounded p-2 bg-black/20 text-white"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.currency_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12">
                <label className="text-xs text-white/60">Ghi chú</label>
                <input
                  name="note"
                  defaultValue={editing.note ?? ""}
                  className="w-full border rounded p-2 bg-black/20 text-white"
                />
              </div>

              <div className="col-span-12 flex justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded border text-sm"
                  onClick={() => setEditing(null)}
                >
                  Huỷ
                </button>
                <button
                  disabled={pending}
                  className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
                >
                  {pending ? "Đang lưu..." : "Lưu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FAB (mobile only) */}
      <button
        onClick={() => setShowAdd(true)}
        className="
          md:hidden
          fixed
          right-4
          bottom-[calc(4.5rem+env(safe-area-inset-bottom))]
          w-14 h-14
          rounded-full
          bg-white
          text-black
          text-3xl
          flex items-center justify-center
          shadow-lg
          z-50
        "
        aria-label="Add transaction"
      >
        +
      </button>

      {/* Add Modal (mobile) */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
          <div className="w-full rounded-t-2xl bg-neutral-950 border-t border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-lg">Thêm giao dịch</div>
              <button
                className="text-sm underline"
                onClick={() => setShowAdd(false)}
              >
                Đóng
              </button>
            </div>

            <form
              action={(fd) => {
                startTransition(async () => {
                  try {
                    await addTransaction(fd);
                    await reload(); // ✅ cập nhật list ngay
                    setShowAdd(false);
                  } catch (e: any) {
                    alert(e?.message ?? "Add failed");
                  }
                });
              }}
              className="grid grid-cols-12 gap-2"
            >
              <input
                type="hidden"
                name="created_at"
                value={new Date().toISOString()}
              />

              <div className="col-span-6">
                <select
                  name="type"
                  defaultValue="expense"
                  className="w-full border rounded p-2 bg-black/20 text-white"
                >
                  <option value="expense">Chi</option>
                  <option value="income">Thu</option>
                </select>
              </div>

              <div className="col-span-6">
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="Số tiền"
                  className="w-full border rounded p-2 bg-black/20 text-white placeholder:text-white/60"
                />
              </div>

              <div className="col-span-12">
                <select
                  name="category_id"
                  className="w-full border rounded p-2 bg-black/20 text-white"
                  defaultValue=""
                >
                  <option value="">(Không chọn danh mục)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} • {c.kind}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12">
                <select
                  name="wallet_id"
                  defaultValue={primaryWalletId}
                  className="w-full border rounded p-2 bg-black/20 text-white"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.currency_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12">
                <input
                  name="note"
                  placeholder="Ghi chú"
                  className="w-full border rounded p-2 bg-black/20 text-white placeholder:text-white/60"
                />
              </div>

              <div className="col-span-12">
                <button
                  disabled={pending || !householdId}
                  className="w-full px-4 py-3 rounded bg-white text-black font-medium"
                >
                  {pending ? "Đang thêm..." : "Thêm giao dịch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
