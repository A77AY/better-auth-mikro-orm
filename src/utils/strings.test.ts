import { describe, expect, test } from "vite-plus/test";
import { propertyKey, quote, stringArray, toKebabCase, toPascalCase, toSnakeCase } from "./strings";

describe("strings utils", () => {
  describe("toPascalCase", () => {
    test("converts standard names to PascalCase", () => {
      expect(toPascalCase("user")).toBe("User");
      expect(toPascalCase("two_factor")).toBe("TwoFactor");
      expect(toPascalCase("oauth-account")).toBe("OauthAccount");
      expect(toPascalCase("passkey_credential")).toBe("PasskeyCredential");
    });

    test("handles leading numbers safely for identifiers", () => {
      expect(toPascalCase("2fa")).toBe("Model2fa");
      expect(toPascalCase("3d_secure")).toBe("Model3dSecure");
    });

    test("handles empty string", () => {
      expect(toPascalCase("")).toBe("Model");
    });
  });

  describe("toSnakeCase", () => {
    test("converts camelCase and PascalCase to snake_case", () => {
      expect(toSnakeCase("emailAddress")).toBe("email_address");
      expect(toSnakeCase("userId")).toBe("user_id");
      expect(toSnakeCase("OAuthAccount")).toBe("oauth_account");
      expect(toSnakeCase("UserRole")).toBe("user_role");
      expect(toSnakeCase("already_snake_case")).toBe("already_snake_case");
      expect(toSnakeCase("kebab-case-name")).toBe("kebab_case_name");
      expect(toSnakeCase("spaced name")).toBe("spaced_name");
    });
  });

  describe("toKebabCase", () => {
    test("creates stable kebab-case names", () => {
      expect(toKebabCase("TwoFactor")).toBe("two-factor");
      expect(toKebabCase("oauth_account")).toBe("oauth-account");
    });
  });

  describe("quote and stringArray", () => {
    test("quote serializes values safely", () => {
      expect(quote("hello")).toBe('"hello"');
      expect(quote('hello "world"')).toBe('"hello \\"world\\""');
    });

    test("stringArray renders formatted arrays", () => {
      expect(stringArray(["admin", "user"])).toBe('["admin", "user"]');
      expect(stringArray([])).toBe("[]");
    });
  });

  describe("propertyKey", () => {
    test("returns raw identifier for valid JS keys", () => {
      expect(propertyKey("userId")).toBe("userId");
      expect(propertyKey("email_address")).toBe("email_address");
      expect(propertyKey("$meta")).toBe("$meta");
      expect(propertyKey("_private")).toBe("_private");
    });

    test("quotes keys with spaces or invalid identifier characters", () => {
      expect(propertyKey("my field")).toBe('"my field"');
      expect(propertyKey("field-with-dash")).toBe('"field-with-dash"');
    });
  });
});
