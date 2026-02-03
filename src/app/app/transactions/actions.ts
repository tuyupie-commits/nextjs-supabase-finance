"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentHouseholdId } from "@/lib/get-current-household";

async function ensureWallet(householdId: string) {
  const supabase = await createClient();

  // wallet primary
  const { data: wallets, error: wErr } = await supabase
    .from("wallets")
    .select("id, currency_code, is_primary")
    .eq("household_id", householdId)
    .order("is_primary", { ascending: false })
    .limit(1);

  if (wErr) throw wErr;
  let wallet = wallets?.[0];

  // nếu chưa có wallet thì tạo wallet chính theo base_currency của household
  if (!wallet) {
    const { data: hh, error: hhErr } = await supabase
      .from("households")
      .select("base_currency")
      .eq("id", householdId)
      .single();
    if (hhErr) throw hhErr;

    const { data: newWallet, error: insErr } = await supabase
      .from("wallets")
      .insert({
        household_id: householdId,
        name: "Ví chính",
        currency_code: hh.base_currency ?? "VND",
        is_primary: true,
      })
      .select("id, currency_code, is_primary")
      .single();

    if (insErr) throw insErr;
    wallet = newWallet;
  }

  return { wallet };
}

export async function addTransaction(formData: FormData) {
  try {
    const type = String(formData.get("type") || "expense") as
      | "income"
      | "expense";

    // ✅ DB không có date, dùng created_at (optional)
    const created_at = String(formData.get("created_at") || "").trim();

    const amount = Number(formData.get("amount") || 0);
    const note = String(formData.get("note") || "").trim();
    const wallet_id = String(formData.get("wallet_id") || "").trim();
    const category_id = String(formData.get("category_id") || "").trim();

    if (!["income", "expense"].includes(type))
      throw new Error("Type không hợp lệ");
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error("Số tiền phải > 0");

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");

    const householdId = await getCurrentHouseholdId();
    if (!householdId) throw new Error("Bạn chưa thuộc household nào");

    const { wallet } = await ensureWallet(householdId);

    // nếu user không chọn wallet => dùng primary
    const finalWalletId = wallet_id || wallet.id;

    // lấy currency theo wallet chọn (bảo đảm thuộc household)
    const { data: w2, error: w2Err } = await supabase
      .from("wallets")
      .select("id, currency_code")
      .eq("id", finalWalletId)
      .eq("household_id", householdId)
      .single();
    if (w2Err) throw w2Err;

    // ✅ insert không dùng cột date nữa
    const payload: any = {
      household_id: householdId,
      user_id: user.id,
      wallet_id: w2.id,
      category_id: category_id || null,
      type,
      amount,
      currency_code: w2.currency_code,
      note: note || null,
    };

    // nếu client gửi created_at thì set, không thì để DB default now()
    if (created_at) payload.created_at = created_at;

    const { error } = await supabase.from("transactions").insert(payload);

    if (error) throw error;
    return { ok: true };
  } catch (e: any) {
    console.error("addTransaction FAILED:", e);
    throw new Error(e?.message ?? "addTransaction failed");
  }
}

export async function updateTransaction(formData: FormData) {
  try {
    const id = String(formData.get("id") || "").trim();
    const type = String(formData.get("type") || "expense") as
      | "income"
      | "expense";

    const amount = Number(formData.get("amount") || 0);
    const note = String(formData.get("note") || "").trim();
    const wallet_id = String(formData.get("wallet_id") || "").trim();
    const category_id = String(formData.get("category_id") || "").trim();

    if (!id) throw new Error("Thiếu id");
    if (!["income", "expense"].includes(type))
      throw new Error("Type không hợp lệ");
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error("Số tiền phải > 0");

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");

    const householdId = await getCurrentHouseholdId();
    if (!householdId) throw new Error("Bạn chưa thuộc household nào");

    // ✅ nếu không chọn wallet thì dùng primary
    const { wallet: primary } = await ensureWallet(householdId);
    const finalWalletId = wallet_id || primary.id;

    // đảm bảo wallet thuộc household
    const { data: w, error: wErr } = await supabase
      .from("wallets")
      .select("id, currency_code")
      .eq("id", finalWalletId)
      .eq("household_id", householdId)
      .single();
    if (wErr) throw wErr;

    // ✅ update không có date nữa
    const { error } = await supabase
      .from("transactions")
      .update({
        type,
        amount,
        note: note || null,
        wallet_id: w.id,
        currency_code: w.currency_code,
        category_id: category_id || null,
      })
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) throw error;
    return { ok: true };
  } catch (e: any) {
    console.error("updateTransaction FAILED:", e);
    throw new Error(e?.message ?? "updateTransaction failed");
  }
}

export async function deleteTransaction(formData: FormData) {
  try {
    const id = String(formData.get("id") || "").trim();
    if (!id) throw new Error("Thiếu id");

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");

    const householdId = await getCurrentHouseholdId();
    if (!householdId) throw new Error("Bạn chưa thuộc household nào");

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) throw error;
    return { ok: true };
  } catch (e: any) {
    console.error("deleteTransaction FAILED:", e);
    throw new Error(e?.message ?? "deleteTransaction failed");
  }
}
