"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function createHousehold(formData: FormData) {
  const name = String(formData.get("name") || "Gia đình").trim();
  const base_currency = String(formData.get("base_currency") || "VND")
    .trim()
    .toUpperCase();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  // 1) create household
  const { data: hh, error: hhErr } = await supabase
    .from("households")
    .insert({ name, base_currency, owner_id: user.id })
    .select("id")
    .single();

  if (hhErr) throw hhErr;

  // 2) add owner membership
  const { error: mErr } = await supabase.from("household_members").insert({
    household_id: hh.id,
    user_id: user.id,
    role: "owner",
  });

  if (mErr) throw mErr;

  // 3) seed categories
  const { error: seedErr } = await supabase.rpc("seed_default_categories", {
    p_household: hh.id,
  });

  if (seedErr) throw seedErr;

  // 4) create primary wallet
  const { error: wErr } = await supabase.from("wallets").insert({
    household_id: hh.id,
    name: "Ví chính",
    currency_code: base_currency,
    is_primary: true,
  });

  if (wErr) throw wErr;

  // ✅ redirect phải nằm ngoài try/catch (và không bị catch)
  redirect("/app");
}
