import { jwtDecode } from "jwt-decode";

const TOKEN_KEY = "synthezia_auth_token";

interface TokenPayload {
	exp: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}

export const getAuthToken = (): string | null => {
	return localStorage.getItem(TOKEN_KEY);
};

export const setAuthToken = (token: string) => {
	localStorage.setItem(TOKEN_KEY, token);
};

export const clearAuthToken = () => {
	localStorage.removeItem(TOKEN_KEY);
};

export const isTokenExpired = (token: string): boolean => {
	try {
		const decoded = jwtDecode<TokenPayload>(token);
		const currentTime = Date.now() / 1000;
		// Check if token will expire in the next 5 minutes (buffer)
		return decoded.exp < (currentTime + 300);
	} catch {
		return true;
	}
};

interface ApiOptions extends RequestInit {
	skipAuth?: boolean;
}

export const apiClient = async (url: string, options: ApiOptions = {}) => {
	const { skipAuth, ...fetchOptions } = options;
	
	// Add default headers
	const headers = new Headers(fetchOptions.headers);
	
	// Add Authorization header if not skipped and token exists
	if (!skipAuth) {
		const token = getAuthToken();
		if (token) {
			headers.set("Authorization", `Bearer ${token}`);
		}
	}

	// Ensure Content-Type is JSON if body is present and not FormData
	if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const config = {
		...fetchOptions,
		headers,
	};

	let response = await fetch(url, config);

	// Handle 401 Unauthorized (Token Refresh)
	if (response.status === 401 && !skipAuth && !url.includes("/auth/login") && !url.includes("/auth/refresh")) {
		try {
			// Try to refresh the token
			const refreshResponse = await fetch("/api/v1/auth/refresh", { method: "POST" });
			
			if (refreshResponse.ok) {
				const data = await refreshResponse.json();
				if (data.token) {
					setAuthToken(data.token);
					
					// Retry the original request with the new token
					headers.set("Authorization", `Bearer ${data.token}`);
					response = await fetch(url, { ...fetchOptions, headers });
				}
			} else {
				// Refresh failed, clear token and redirect to login if needed
				// We don't redirect here to avoid side effects in non-UI code, 
				// but the AuthContext will detect the 401 eventually or the UI will react.
				// Actually, clearing the token here is safe.
				clearAuthToken();
				// Dispatch a custom event so AuthContext can react
				window.dispatchEvent(new Event("auth:logout"));
			}
		} catch {
			clearAuthToken();
			window.dispatchEvent(new Event("auth:logout"));
		}
	}

	return response;
};
