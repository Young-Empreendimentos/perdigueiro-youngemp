import { describe, it, expect } from "vitest";
import { parseCoordinatesInput } from "@/lib/coordinateParser";

describe("example", () => {
  it("should pass", () => {
    expect(true).toBe(true);
  });
});

describe("parseCoordinatesInput", () => {
  it("accepts decimal latitude and longitude", () => {
    expect(parseCoordinatesInput("-23.512345, -46.612345")).toEqual({ lat: -23.512345, lng: -46.612345 });
  });

  it("accepts KML longitude and latitude order", () => {
    expect(parseCoordinatesInput("-46.612345,-23.512345,0")).toEqual({ lat: -23.512345, lng: -46.612345 });
  });

  it("converts UTM coordinates copied from Google Earth", () => {
    const coords = parseCoordinatesInput("22 J 334000 7399000");

    expect(coords.lat).toBeCloseTo(-23.512, 2);
    expect(coords.lng).toBeCloseTo(-46.612, 2);
  });
});
