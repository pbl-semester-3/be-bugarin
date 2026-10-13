import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env";
import { AppError } from "../../middlewares/error-handler";

export type GooglePayload = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
};

// Dibungkus sebagai object supaya test bisa mengganti verifyIdToken (monkey-patch)
// tanpa perlu ID token Google asli.
export const googleAuth = {
  isConfigured(): boolean {
    return Boolean(env.GOOGLE_CLIENT_ID);
  },

  async verifyIdToken(idToken: string): Promise<GooglePayload> {
    try {
      const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        throw new AppError(401, "Token Google tidak valid");
      }
      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        name: payload.name,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(401, "Token Google tidak valid");
    }
  },
};
