import { describe, expect, test } from "vite-plus/test";
import { attachGeneratorOptions, readGeneratorOptions } from "./options";

describe("adapter options symbol attachment", () => {
  test("attaches and reads generator options from adapter factory", () => {
    const dummyFactory = () => ({});
    attachGeneratorOptions(dummyFactory, { casing: "snake_case", fileSuffix: ".entity" });

    const options = readGeneratorOptions(dummyFactory);
    expect(options).toEqual({ casing: "snake_case", fileSuffix: ".entity" });
  });

  test("handles undefined options gracefully", () => {
    const dummyFactory = () => ({});
    attachGeneratorOptions(dummyFactory, undefined);

    const options = readGeneratorOptions(dummyFactory);
    expect(options).toEqual({});
  });

  test("returns undefined for non-function values or non-decorated functions", () => {
    expect(readGeneratorOptions(null)).toBeUndefined();
    expect(readGeneratorOptions({})).toBeUndefined();
    expect(readGeneratorOptions("string")).toBeUndefined();
    expect(readGeneratorOptions(() => ({}))).toBeUndefined();
  });
});
