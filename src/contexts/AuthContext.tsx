import { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import type { AxiosInstance } from "axios";

// The structure of your auth state
export interface AuthState {
  id: number;
  email: string;
  fullName: string;
  roleCode: number;
  buildingId: number;
  blockId: number;
  companyName: string;
  phone: string;
  accessToken: string;
}

// Login input type
interface LoginInput {
  email: string;
  password: string;
}

// What the context provides
interface AuthContextType {
  auth: AuthState | null;
  login: (
    credentials: LoginInput
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  axiosInstance: AxiosInstance;
}

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Props type for the provider
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const stored = localStorage.getItem("auth");
    return stored ? (JSON.parse(stored) as AuthState) : null;
  });

  // Logout
  const logout = () => {
    localStorage.removeItem("auth");
    setAuth(null);
  };

  // Sync auth state to localStorage
  useEffect(() => {
    if (auth?.accessToken) {
      localStorage.setItem("auth", JSON.stringify(auth));
    } else {
      localStorage.removeItem("auth");
    }
  }, [auth]);

  // Axios instance with interceptors (to use the same baseURL across many requests)
  const axiosInstance = useMemo(() => {
    const instance = axios.create({
      baseURL:
        import.meta.env.MODE === "development"
          ? "http://localhost:3000"
          : import.meta.env.VITE_BASE_URL,
      withCredentials: true,
    });

    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry && auth) {
          originalRequest._retry = true;
          try {
            const res = await instance.get("/auth/refresh");
            const newAccessToken = res.data.accessToken;

            const updatedAuth = { ...auth, accessToken: newAccessToken };
            setAuth(updatedAuth);
            localStorage.setItem("auth", JSON.stringify(updatedAuth));

            originalRequest.headers = {
              ...originalRequest.headers,
              Authorization: `Bearer ${newAccessToken}`,
            };

            return instance(originalRequest);
          } catch (refreshErr) {
            logout();
            return Promise.reject(refreshErr);
          }
        }
        return Promise.reject(error);
      }
    );

    return instance;
  }, [auth, setAuth, logout]);

  // Login function
  const login = async ({ email, password }: LoginInput) => {
    try {
      const response = await axiosInstance.post("/auth", { email, password });
      const userData = response.data;

      //console.log(userData);

      setAuth(userData);

      return { success: true, ...userData };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.message || err.message,
      };
    }
  };

  return (
    <AuthContext.Provider value={{ auth, login, logout, axiosInstance }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to access auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
