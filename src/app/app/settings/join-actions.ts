"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function joinWithCode(formData: FormData) {
  const code = String(formData.get("code") || "")
    .trim()
    .toUpperCase();
  if (!code) return { ok: false, message: "Vui lòng nhập mã mời" };

  const supabase = await createClient();

  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) return { ok: false, message: uErr.message };
  if (!user) return { ok: false, message: "Bạn chưa đăng nhập" };

  const { error } = await supabase.rpc("use_invite", { p_code: code });

  if (error) {
    // trả message thật để bạn biết bị gì (RLS/đủ 2 người/code sai/hết hạn)
    return { ok: false, message: error.message };
  }

  revalidatePath("/app");
  revalidatePath("/app/settings");

  return { ok: true };
}
