import { useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { ApiError } from "../../lib/api";

export default function ChangePasswordScreen() {
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return setError("New password needs at least 6 characters");
    if (newPassword !== confirm) return setError("Passwords don't match");
    setBusy(true);
    setError("");
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-zinc-950 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      <form
        onSubmit={submit}
        className="relative w-full max-w-sm bg-zinc-900 rounded-2xl shadow-2xl shadow-black/50 border border-zinc-800 p-8 space-y-6"
      >
        <div>
          <div className="text-lg font-semibold text-zinc-50 tracking-tight">Choose a new password</div>
          <p className="text-sm text-zinc-400 mt-1">
            Hi {user?.name} — this account needs a password change before continuing.
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-zinc-400">Current password</span>
            <input
              type="password"
              autoFocus
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none transition-colors"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-zinc-400">New password (min 6 characters)</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none transition-colors"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-zinc-400">Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none transition-colors"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50"
        >
          {busy ? "Saving…" : "Set password"}
        </button>
        <button type="button" onClick={logout} className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Sign in as someone else
        </button>
      </form>
    </div>
  );
}
