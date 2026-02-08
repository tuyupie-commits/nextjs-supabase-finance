"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function joinWithCode(formData: FormData) {
  // 1️⃣ Lấy & chuẩn hoá mã mời
  const code = String(formData.get("code") || "")
    .trim()
    .toUpperCase();

  if (!code) {
    return { ok: false, message: "Vui lòng nhập mã mời" };
  }

  // 2️⃣ Tạo supabase server client
  const supabase = await createClient();

  // 3️⃣ Lấy user hiện tại
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return { ok: false, message: userErr.message };
  }

  if (!user) {
    return { ok: false, message: "Bạn chưa đăng nhập" };
  }

  // 4️⃣ GỌI RPC use_invite
  const { data, error } = await supabase.rpc("use_invite", {
    p_code: code,
  });

  if (error) {
    console.error("RPC use_invite error:", error);

    return {
      ok: false,
      // message này lấy trực tiếp từ PostgreSQL
      message: error.message,
    };
  }

  // 5️⃣ Revalidate UI
  revalidatePath("/app");
  revalidatePath("/app/settings");

  return {
    ok: true,
    data, // giữ lại để debug nếu cần
  };
}
