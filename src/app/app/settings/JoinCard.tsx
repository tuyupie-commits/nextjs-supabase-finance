"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinWithCode } from "./join-actions";

export default function JoinCard() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onJoin() {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("code", code);
      await joinWithCode(fd);
      router.replace("/app/transactions");
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Join thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border rounded p-4 bg-white/5 space-y-3">
      <div className="font-medium">Join bằng mã mời</div>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Nhập invite code"
          className="flex-1 border rounded p-2 bg-black/20 text-white"
        />
        <button
          onClick={onJoin}
          disabled={pending || !code.trim()}
          className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
        >
          {pending ? "Đang join..." : "Join"}
        </button>
      </div>

      <div className="text-xs text-white/50">
        Lưu ý: household tối đa 2 người (vợ/chồng).
      </div>
    </div>
  );
}
