import { describe, expect, it } from "bun:test";
import { BULK_DISCOUNT, BULK_HOURS, BUNDLES, HOURLY_NAIRA, bundleGrants, tierRank } from "../src/config/pricing";

// Worst case for us: the host talks non-stop, one voice language plus one extra text language, N1,400 to the dollar.
const WORST_COST_PER_HOUR = { captions: 1680, standard: 2730, local: 7800 } as const;

describe("plan prices stay worth buying and stay profitable", () => {
  const parts = (id: string) => bundleGrants(BUNDLES.find((b) => b.id === id)!);
  const hourlyValue = (id: string) => parts(id).reduce((n, g) => n + g.hours * HOURLY_NAIRA[g.tier], 0);
  const hoursOf = (id: string) => parts(id).reduce((n, g) => n + g.hours, 0);
  const worstCost = (id: string) => parts(id).reduce((n, g) => n + g.hours * WORST_COST_PER_HOUR[g.tier], 0);

  for (const b of BUNDLES) {
    it(`${b.id} is cheaper than the same hours bought one by one, even with the bulk discount`, () => {
      const hourly = hourlyValue(b.id);
      const bulk = hoursOf(b.id) >= BULK_HOURS ? hourly * (1 - BULK_DISCOUNT) : hourly;
      expect(b.amountNaira).toBeLessThan(bulk);
    });

    it(`${b.id} still covers what it costs us at full use`, () => {
      expect(b.amountNaira).toBeGreaterThan(worstCost(b.id) * 1.1);
    });
  }

  it("never charges more for a lower level than a higher one", () => {
    const levels = ["captions", "standard", "local"] as const;
    for (const e of ["sermon", "service", "conference", "classroom"]) {
      const price = levels.map((t) => BUNDLES.find((b) => b.id === `${e}-${t}`)!.amountNaira);
      expect(price[0]!).toBeLessThan(price[1]!);
      expect(price[1]!).toBeLessThan(price[2]!);
    }
    expect(tierRank("local")).toBeGreaterThan(tierRank("captions"));
  });

  it("hourly prices cover the worst case with room to spare", () => {
    for (const t of ["captions", "standard", "local"] as const) expect(HOURLY_NAIRA[t]).toBeGreaterThan(WORST_COST_PER_HOUR[t] * 1.3);
  });
});
