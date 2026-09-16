import { useEffect, useState, useCallback } from "react";
import { auth } from "./api";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { username, name, role, mustChangePassword }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const me = await auth.login(username, password);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    await auth.logout().catch(() => {});
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await auth.changePassword(currentPassword, newPassword);
    setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
