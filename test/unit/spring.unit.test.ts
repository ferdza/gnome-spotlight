import { describe, expect, test } from "bun:test";

import {
  SPRING_BOUNCY,
  SPRING_DEFAULT,
  SPRING_GLIDE,
  SPRING_SMOOTH,
  SPRING_SNAPPY,
  springProgress,
  springSettleSeconds,
} from "@domain/animation/spring";

const SPECS = [SPRING_SMOOTH, SPRING_GLIDE, SPRING_SNAPPY, SPRING_DEFAULT, SPRING_BOUNCY];

const samples = (spec: (typeof SPECS)[number]): number[] => {
  const end = springSettleSeconds(spec);
  return Array.from({ length: 200 }, (_, i) => springProgress((end * (i + 1)) / 200, spec));
};

describe("mola de Apple (resposta e amortecimento)", () => {
  test.each(SPECS)("começa em 0 e termina em 1", (spec) => {
    expect(springProgress(0, spec)).toBe(0);
    expect(springProgress(springSettleSeconds(spec), spec)).toBeCloseTo(1, 2);
  });

  test("amortecimento 1 nunca passa do alvo", () => {
    expect(Math.max(...samples(SPRING_SMOOTH))).toBeLessThanOrEqual(1);
    expect(Math.max(...samples(SPRING_GLIDE))).toBeLessThanOrEqual(1);
  });

  test.each([SPRING_SNAPPY, SPRING_DEFAULT, SPRING_BOUNCY])("abaixo de 1 passa do alvo", (spec) => {
    expect(Math.max(...samples(spec))).toBeGreaterThan(1);
  });

  test("quanto menor o amortecimento, maior a passada", () => {
    const overshoot = (spec: (typeof SPECS)[number]) => Math.max(...samples(spec)) - 1;

    expect(overshoot(SPRING_BOUNCY)).toBeGreaterThan(overshoot(SPRING_DEFAULT));
    expect(overshoot(SPRING_DEFAULT)).toBeGreaterThan(overshoot(SPRING_SNAPPY));
  });

  test("a resposta é o tempo da primeira ida ao alvo, aproximadamente", () => {
    const crossing = Array.from({ length: 1000 }, (_, i) => i / 1000).find(
      (seconds) => springProgress(seconds, SPRING_BOUNCY) >= 1,
    );

    expect(crossing).toBeGreaterThan(SPRING_BOUNCY.response * 0.15);
    expect(crossing).toBeLessThan(SPRING_BOUNCY.response);
  });

  test("o tempo de assentamento fica dentro do limite", () => {
    for (const spec of SPECS) {
      expect(springSettleSeconds(spec)).toBeGreaterThan(0);
      expect(springSettleSeconds(spec)).toBeLessThanOrEqual(2);
    }
  });
});
