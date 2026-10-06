declare global {
  namespace Express {
    interface Request {
      /** Attached by `middleware/auth.ts` for authenticated routes. */
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export {};
