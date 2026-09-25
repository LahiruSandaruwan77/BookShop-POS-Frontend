import { useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { ApiError } from "../../lib/api";

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-zinc-950 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <form
        onSubmit={submit}
        className="relative w-full max-w-sm bg-zinc-900 rounded-2xl shadow-2xl shadow-black/50 border border-zinc-800 p-8 space-y-6"
      >
        <div className="text-center space-y-1">
          <img
            src="/abc-bookshop-icon.jpeg"
            alt="ABC Book Shop & Communication"
            className="mx-auto mb-3 h-11 w-11 rounded-xl border border-zinc-800 object-cover"
          />
          <div className="text-lg font-semibold text-zinc-50 tracking-tight">ABC Book Shop &amp; Communication</div>
          <div className="text-xs text-zinc-500 uppercase tracking-widest">Point of sale</div>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-zinc-400">Username</span>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none transition-colors"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-zinc-400">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none transition-colors"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
