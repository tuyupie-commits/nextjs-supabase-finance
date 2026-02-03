"use server";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function joinByCode(formData: FormData) {
  const code = String(formData.get("code") || "").trim();
  const supabase = await createClient();

  const { error } = await supabase.rpc("use_invite", { p_code: code });
  if (error) throw error;

  redirect("/app");
}
