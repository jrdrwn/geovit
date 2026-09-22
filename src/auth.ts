import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
const attempts = new Map<string, { count: number; at: number }>();
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(c) {
        if (
          !db ||
          typeof c.email !== "string" ||
          typeof c.password !== "string" ||
          c.password.length > 200
        )
          return null;
        const key = c.email.toLowerCase();
        const now = Date.now();
        if (attempts.size > 5000)
          for (const [id, value] of attempts)
            if (now - value.at > 900000) attempts.delete(id);
        const previous = attempts.get(key);
        const attempt =
          previous && now - previous.at < 900000
            ? previous
            : { count: 0, at: now };
        attempt.count++;
        attempts.set(key, attempt);
        if (attempt.count > 10) return null;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, c.email.toLowerCase()))
          .limit(1);
        if (!user || !(await compare(c.password, user.password_hash)))
          return null;
        attempts.delete(key);
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
export async function currentUser() {
  const session = await auth();
  if (!db || !session?.user?.id) return null;
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  return user || null;
}
