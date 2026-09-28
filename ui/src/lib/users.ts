import ax from "./axios";

const emailCache = new Map<number, string>();

export async function lookupUserByEmail(
  email: string,
): Promise<{ id: number; email: string } | null> {
  try {
    const { data } = await ax.get("/users/lookup", { params: { email } });
    return data;
  } catch (error: any) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

export async function getUserEmail(userId: number): Promise<string> {
  const cached = emailCache.get(userId);
  if (cached) return cached;

  const { data } = await ax.get(`/users/${userId}`);
  emailCache.set(userId, data.email);
  return data.email;
}
