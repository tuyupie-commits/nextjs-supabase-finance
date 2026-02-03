"use server";

import { createClient } from "@/utils/supabase/server";

export type Status = {
  householdId: string;
  householdName: string;
  memberCount: number;
  isOwner: boolean;
};

export async function getHouseholdStatus(): Promise<
  { ok: true; data: Status | null } | { ok: false; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();

  if (uErr) return { ok: false, message: uErr.message };
  if (!user) return { ok: false, message: "Chưa đăng nhập" };

  const { data: mem, error: mErr } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (mErr) return { ok: false, message: mErr.message };

  const householdId = mem?.[0]?.household_id as string | undefined;
  if (!householdId) {
    // ✅ chưa có household là trạng thái bình thường
    return { ok: true, data: null };
  }

  const isOwner = mem?.[0]?.role === "owner";

  const { data: hh, error: hErr } = await supabase
    .from("households")
    .select("id, name")
    .eq("id", householdId)
    .single();

  if (hErr) return { ok: false, message: hErr.message };

  const { count, error: cErr } = await supabase
    .from("household_members")
    .select("*", { count: "exact", head: true })
    .eq("household_id", householdId);

  if (cErr) return { ok: false, message: cErr.message };

  return {
    ok: true,
    data: {
      householdId,
      householdName: hh?.name ?? "Household",
      memberCount: count ?? 0,
      isOwner,
    },
  };
}

export async function createInvite(): Promise<
  { ok: true; data: any } | { ok: false; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();

  if (uErr) return { ok: false, message: uErr.message };
  if (!user) return { ok: false, message: "Chưa đăng nhập" };

  const { data: mem, error: mErr } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (mErr) return { ok: false, message: mErr.message };

  const householdId = mem?.[0]?.household_id as string | undefined;
  const role = mem?.[0]?.role as string | undefined;

  if (!householdId)
    return { ok: false, message: "Bạn chưa thuộc household nào" };
  if (role !== "owner")
    return { ok: false, message: "Chỉ owner mới được tạo mã mời" };

  // ✅ Gọi đúng function đang có trên DB: create_invite(p_household uuid)
  const { data, error } = await supabase.rpc("create_invite", {
    p_household: householdId,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, data };
}
