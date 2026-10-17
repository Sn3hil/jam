import { describe, expect, test } from "bun:test";
import { splitToolExtraArgs } from "./envArgs";

describe("splitToolExtraArgs", () => {
  test("splits on whitespace and strips comments", () => {
    expect(splitToolExtraArgs("--a b --c")).toEqual(["--a", "b", "--c"]);
    expect(splitToolExtraArgs("--x # inline comment\n--y")).toEqual(["--x", "--y"]);
    expect(splitToolExtraArgs("")).toEqual([]);
    expect(splitToolExtraArgs("   \n  ")).toEqual([]);
  });
});
