"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createInvite, getHouseholdStatus } from "./actions";
import { logout } from "./logout";
import { joinWithCode } from "./join-actions";
import Link from "next/link";

type Invite = {
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number | null;
};

type Status = {
  householdId: string;
  householdName: string;
  memberCount: number;
  isOwner: boolean;
};

export default function SettingsPage() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // join code for "no household" block
  const [joinCode, setJoinCode] = useState("");

  // join code for "(optional) join other household" block
  const [joinCode2, setJoinCode2] = useState("");

  const full = useMemo(() => (status?.memberCount ?? 0) >= 2, [status]);

  useEffect(() => {
    startTransition(async () => {
      try {
        setErr(null);
        const res = await getHouseholdStatus();

        if (!res.ok) {
          setStatus(null);
          setErr(res.message);
        } else {
          setStatus(res.data); // ✅ Status | null
        }
      } finally {
        setLoaded(true);
      }
    });
  }, []);

  function onCreateInvite() {
    startTransition(async () => {
      setErr(null);

      const res = await createInvite();
      if (!res.ok) {
        setErr(res.message ?? "Tạo mã mời thất bại");
        return;
      }

      setInvite(res.data);

      const st = await getHouseholdStatus();
      if (st.ok) setStatus(st.data);
      else setErr(st.message);
    });
  }

  async function copyCode() {
    const text = invite?.code;
    if (!text) return;

    // 1) Clipboard API (works on https/localhost)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        alert("Đã copy mã mời!");
        return;
      }
    } catch {}

    // 2) Fallback: select input + execCommand
    try {
      const el = document.getElementById(
        "invite-code",
      ) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
        const ok = document.execCommand("copy");
        if (ok) {
          alert("Đã copy mã mời!");
          return;
        }
      }
    } catch {}

    // 3) Final fallback: hướng dẫn người dùng
    alert("Không thể copy tự động. Hãy bấm giữ vào mã và chọn Copy.");
  }

  function submitJoin(codeValue: string, clear: () => void) {
    startTransition(async () => {
      setErr(null);

      const fd = new FormData();
      fd.set("code", codeValue);

      const res = await joinWithCode(fd);
      if (!res.ok) {
        setErr(res.message || "Join thất bại");
        return;
      }

      // ✅ join thành công → reload status (đúng kiểu)
      const st = await getHouseholdStatus();
      if (!st.ok) {
        setStatus(null);
        setErr(st.message);
        return;
      }

      setStatus(st.data); // ✅ Status | null
      clear();
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Error banner */}
      {err && (
        <div className="border border-red-500/40 bg-red-500/10 rounded p-3 text-sm">
          {err}
        </div>
      )}

      {/* Loading */}
      {!loaded && <div className="text-sm text-white/70">Đang tải...</div>}

      {/* ===== CASE: CHƯA CÓ HOUSEHOLD ===== */}
      {loaded && !status && (
        <>
          <div className="border rounded p-4 bg-white/5 space-y-2">
            <div className="font-medium">Bạn chưa thuộc household nào</div>
            <div className="text-sm text-white/70">
              Bạn có thể tạo household mới hoặc join bằng mã mời.
            </div>

            <div className="flex gap-2">
              <Link
                href="/onboarding"
                className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
              >
                Tạo household
              </Link>
              <a
                href="#join"
                className="px-4 py-2 rounded border text-sm text-white/80"
              >
                Nhập mã mời
              </a>
            </div>
          </div>

          {/* Join bằng mã mời */}
          <div id="join" className="border rounded p-4 bg-white/5 space-y-2">
            <div className="font-medium">Join bằng mã mời</div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!joinCode.trim()) return;
                submitJoin(joinCode, () => setJoinCode(""));
              }}
            >
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Nhập invite code"
                className="flex-1 border rounded p-2 bg-black/20 text-white"
              />
              <button
                disabled={pending || !joinCode.trim()}
                className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
              >
                {pending ? "..." : "Join"}
              </button>
            </form>

            <div className="text-xs text-white/50">
              Lưu ý: household chỉ tối đa 2 người (vợ/chồng).
            </div>
          </div>

          {/* Logout */}
          <div className="border rounded p-4 bg-white/5">
            <form action={logout}>
              <button className="px-4 py-2 rounded border text-sm text-red-200 border-red-500/40 hover:bg-red-500/10">
                Đăng xuất
              </button>
            </form>
          </div>
        </>
      )}

      {/* ===== CASE: ĐÃ CÓ HOUSEHOLD ===== */}
      {loaded && status && (
        <>
          {/* Household status */}
          <div className="border rounded p-4 bg-white/5 space-y-2">
            <div className="text-sm text-white/60">Household</div>
            <div className="font-semibold text-lg">{status.householdName}</div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                Thành viên:{" "}
                <span className="font-semibold">{status.memberCount}/2</span>
              </div>

              <span
                className={[
                  "text-xs px-2 py-1 rounded",
                  full
                    ? "bg-red-500/20 text-red-200"
                    : "bg-green-500/20 text-green-200",
                ].join(" ")}
              >
                {full ? "Đã đủ 2 người" : "Còn chỗ"}
              </span>
            </div>

            <div className="text-xs text-white/50">
              {status.isOwner
                ? "Bạn là chủ household (owner)."
                : "Bạn là thành viên (member)."}
            </div>
          </div>

          {/* Invite (owner) */}
          {status.isOwner && (
            <div className="border rounded p-4 bg-white/5 space-y-3">
              <div className="font-medium">Mã mời (Invite Code)</div>

              <button
                onClick={onCreateInvite}
                disabled={pending || full}
                className={[
                  "px-4 py-2 rounded text-sm font-medium",
                  pending || full
                    ? "bg-white/20 text-white/60 cursor-not-allowed"
                    : "bg-white text-black",
                ].join(" ")}
              >
                {pending ? "Đang xử lý..." : "Tạo mã mời cho người thứ 2"}
              </button>

              {full && (
                <div className="text-sm text-white/70">
                  Household đã đủ 2 người, nên không thể tạo mã mời thêm.
                </div>
              )}

              {invite && (
                <div className="border rounded p-3 bg-black/20 space-y-2">
                  <div className="text-sm text-white/60">Mã mời:</div>
                  <div className="flex items-center gap-2">
                    <input
                      id="invite-code"
                      readOnly
                      value={invite.code}
                      className="w-44 md:w-56 border rounded p-2 bg-black/30 text-white font-semibold tracking-wider"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      type="button"
                      onClick={copyCode}
                      className="px-3 py-2 rounded border border-white/20 text-sm"
                    >
                      Copy
                    </button>
                  </div>

                  <div className="text-xs text-white/50">
                    Hết hạn:{" "}
                    {invite.expires_at
                      ? new Date(invite.expires_at).toLocaleString()
                      : "Không"}
                  </div>
                  <div className="text-xs text-white/50">
                    Lượt dùng: {invite.used_count ?? 0}/{invite.max_uses ?? 1}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Join (optional) */}
          {!full && (
            <div className="border rounded p-4 bg-white/5 space-y-2">
              <div className="font-medium">Join bằng mã mời</div>
              <div className="text-xs text-white/50">
                (Tuỳ chọn) Bạn có thể dùng để join household khác.
              </div>

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!joinCode2.trim()) return;
                  submitJoin(joinCode2, () => setJoinCode2(""));
                }}
              >
                <input
                  value={joinCode2}
                  onChange={(e) => setJoinCode2(e.target.value)}
                  placeholder="Nhập invite code"
                  className="flex-1 border rounded p-2 bg-black/20 text-white"
                />
                <button
                  disabled={pending || !joinCode2.trim()}
                  className="px-4 py-2 rounded bg-white text-black text-sm font-medium"
                >
                  {pending ? "..." : "Join"}
                </button>
              </form>
            </div>
          )}

          {/* Logout */}
          <div className="border rounded p-4 bg-white/5">
            <form action={logout}>
              <button className="px-4 py-2 rounded border text-sm text-red-200 border-red-500/40 hover:bg-red-500/10">
                Đăng xuất
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
