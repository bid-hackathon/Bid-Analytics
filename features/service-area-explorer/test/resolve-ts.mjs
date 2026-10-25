// Lets `node --test` run this feature's .ts tests without installing anything:
// Node strips the types natively, and this hook resolves the extensionless
// relative imports the app's bundler expects. Requires Node 22.18+.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.') || /\.[cm]?[jt]sx?$/.test(specifier)) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
