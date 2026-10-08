function invalidConfiguration(message: string): never {
  console.error(message);
  process.exit(1);
}

export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NODE_ENV !== "production"
  )
    return;
  const secret = process.env.NEXTAUTH_SECRET;
  if (
    !secret ||
    secret.length < 32 ||
    /^(dev-|replace|change|example)/i.test(secret)
  )
    invalidConfiguration(
      "NEXTAUTH_SECRET must be a non-placeholder secret of at least 32 characters",
    );
  for (const key of ["API_URL", "NEXTAUTH_URL"] as const) {
    try {
      const value = process.env[key];
      if (!value) throw new Error();
      const url = new URL(value);
      const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
      if (
        url.username ||
        url.password ||
        url.hash ||
        url.search ||
        (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
        (key === "NEXTAUTH_URL" && url.origin !== value)
      )
        throw new Error();
    } catch {
      invalidConfiguration(`Invalid or missing ${key}`);
    }
  }
}
