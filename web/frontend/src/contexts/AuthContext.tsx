/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { apiClient, setAuthToken, clearAuthToken, isTokenExpired, getAuthToken } from "../lib/api";

interface AuthContextType {
	token: string | null;
	isAuthenticated: boolean;
	requiresRegistration: boolean;
	isInitialized: boolean;
	login: (token: string) => void;
	logout: () => void;
	getAuthHeaders: () => { Authorization?: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
	children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
	const [token, setTokenState] = useState<string | null>(getAuthToken());
	const [isInitialized, setIsInitialized] = useState(false);
	const [requiresRegistration, setRequiresRegistration] = useState(false);
	
	// Use refs to avoid re-creating intervals on every render
	const tokenCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

	// Logout function
  const logout = useCallback(() => {
    setTokenState(null);
    clearAuthToken();
    // Call logout endpoint to invalidate token server-side (optional)
    apiClient("/api/v1/auth/logout", {
      method: "POST",
    }).catch(() => {
      // Ignore errors in logout call
    });
    // Force navigate to login (home) for any unauthorized state
    if (window.location.pathname !== "/") {
      window.history.pushState({ route: { path: 'home' } }, "", "/");
      window.dispatchEvent(new PopStateEvent('popstate', { state: { route: { path: 'home' } } as any }));
    }
  }, []);

	// Check registration status and load token on mount
	useEffect(() => {
    const initializeAuth = async () => {
			try {
				// First, check if registration is required
				const response = await apiClient("/api/v1/auth/registration-status", { skipAuth: true });
				if (response.ok) {
                const data = await response.json();
                // Support both legacy and current API response shapes
                const regEnabled =
                  typeof data.registration_enabled === 'boolean'
                    ? data.registration_enabled
                    : !!data.requiresRegistration;
                setRequiresRegistration(regEnabled);
					
					// Only check for existing token if registration is not required
                    if (!regEnabled) {
						const savedToken = getAuthToken();
						if (savedToken) {
							if (isTokenExpired(savedToken)) {
								// Token expired, remove it
								clearAuthToken();
								setTokenState(null);
							} else {
								setTokenState(savedToken);
							}
						}
					}
				}
			} catch (error) {
				console.error("Failed to check registration status:", error);
				// If we can't check status, assume no registration needed and check token
				const savedToken = getAuthToken();
				if (savedToken) {
					if (isTokenExpired(savedToken)) {
						clearAuthToken();
						setTokenState(null);
					} else {
						setTokenState(savedToken);
					}
				}
			} finally {
				setIsInitialized(true);
			}
		};

		initializeAuth();
  }, []);

	const login = useCallback((newToken: string) => {
		setTokenState(newToken);
		setAuthToken(newToken);
		setRequiresRegistration(false); // Clear registration requirement after successful login/registration
	}, []);

	// Helper: attempt to refresh JWT via cookie refresh token
	const tryRefresh = useCallback(async (): Promise<string | null> => {
		try {
			const res = await apiClient('/api/v1/auth/refresh', { method: 'POST', skipAuth: true })
			if (!res.ok) return null
			const data = await res.json()
			if (data?.token) {
				login(data.token)
				return data.token as string
			}
			return null
		} catch {
			return null
		}
	}, [login])

	// Listen for auth:logout event from api client
	useEffect(() => {
		const handleLogout = () => {
			logout();
		};
		window.addEventListener("auth:logout", handleLogout);
		return () => {
			window.removeEventListener("auth:logout", handleLogout);
		};
	}, [logout]);

	// Token expiry check interval
	useEffect(() => {
		// Clear any existing token check interval
		if (tokenCheckIntervalRef.current) {
			clearInterval(tokenCheckIntervalRef.current);
		}

		// Setup token expiry checking if we have a token
		if (token) {
			const checkTokenExpiry = async () => {
				if (!token) return;
				
				if (isTokenExpired(token)) {
					const newToken = await tryRefresh();
					if (!newToken) {
						logout();
					}
				}
			};

			// Check token expiry every minute
			tokenCheckIntervalRef.current = setInterval(checkTokenExpiry, 60000);
			
			// Also check immediately if token is already expired
			checkTokenExpiry();
		}

		return () => {
			if (tokenCheckIntervalRef.current) {
				clearInterval(tokenCheckIntervalRef.current);
			}
		};
	}, [token, logout, tryRefresh])

	const getAuthHeaders = useCallback(() => {
		if (token) {
			return { Authorization: `Bearer ${token}` };
		}
		return {};
	}, [token]);

	// Memoize context value to prevent unnecessary re-renders
	const value = useMemo(() => ({
		token,
		isAuthenticated: !!token && isInitialized,
		requiresRegistration,
		isInitialized,
		login,
		logout,
		getAuthHeaders,
	}), [token, isInitialized, requiresRegistration, login, logout, getAuthHeaders]);


	return (
		<AuthContext.Provider value={value}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
