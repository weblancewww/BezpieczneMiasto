import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
	providers: [
		Credentials({
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Hasło", type: "password" },
			},
			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					return null;
				}

				const user = await prisma.user.findUnique({
					where: { email: credentials.email as string },
					include: { organization: true },
				});

				if (!user) {
					return null;
				}

				const isPasswordValid = await compare(
					credentials.password as string,
					user.password,
				);

				if (!isPasswordValid) {
					return null;
				}

				return {
					id: user.id,
					email: user.email,
					name: user.name,
					role: user.role,
					organizationId: user.organizationId ?? undefined,
					organizationName: user.organization?.name ?? undefined,
				};
			},
		}),
	],
	jwt: {
		maxAge: 30 * 24 * 60 * 60, // 30 days
	},
	session: {
		strategy: "jwt",
		maxAge: 30 * 24 * 60 * 60,
	},
	pages: {
		signIn: "/login",
	},
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.role = user.role;
				token.organizationId = user.organizationId;
				token.organizationName = user.organizationName;
			}
			return token;
		},
		async session({ session, token }) {
			if (session.user) {
				session.user.id = token.sub || "";
				session.user.role =
					typeof token.role === "string" ? token.role : undefined;
				session.user.organizationId =
					typeof token.organizationId === "string"
						? token.organizationId
						: undefined;
				session.user.organizationName =
					typeof token.organizationName === "string"
						? token.organizationName
						: undefined;
			}
			return session;
		},
	},
});

declare module "next-auth" {
	interface User {
		role?: string;
		organizationId?: string;
		organizationName?: string;
	}

	interface Session {
		user: {
			id: string;
			email?: string | null;
			name?: string | null;
			image?: string | null;
			role?: string;
			organizationId?: string;
			organizationName?: string;
		};
	}
}
