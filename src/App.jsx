import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import LoginScreen from "./app/Login/page";
import ChangePasswordScreen from "./app/ChangePassword/page";
import BillingScreen from "./app/BillingUI/page";
import AdminScreen from "./app/AdminUI/page";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-500 text-sm">
        Loading…
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  if (user.mustChangePassword) return <ChangePasswordScreen />;

  return (
    <Routes>
      <Route path="/billing" element={<BillingScreen />} />
      <Route
        path="/admin"
        element={user.role === "ADMIN" ? <AdminScreen /> : <Navigate to="/billing" replace />}
      />
      <Route
        path="*"
        element={<Navigate to={user.role === "ADMIN" ? "/admin" : "/billing"} replace />}
      />
    </Routes>
  );
}
