import { createHousehold } from "./actions";

export default function OnboardingPage() {
  return (
    <form action={createHousehold} className="p-6 max-w-md mx-auto space-y-3">
      <h1 className="text-xl font-semibold">Tạo household</h1>

      <input
        name="name"
        className="w-full border p-2 rounded"
        placeholder="Tên (vd. Nhà Minh & Lan)"
      />

      {/* khuyên dùng select thay vì input để tránh nhập sai */}
      <select name="base_currency" className="w-full border p-2 rounded">
        <option value="VND">VND</option>
        <option value="USD">USD</option>
        <option value="KRW">KRW</option>
      </select>

      <button className="w-full bg-black text-white py-2 rounded">Tạo</button>

      <p className="text-sm text-gray-500">
        Muốn join bằng mã mời? vào Settings trong /app.
      </p>
    </form>
  );
}
