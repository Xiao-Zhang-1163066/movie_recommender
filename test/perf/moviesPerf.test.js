import { describe, it, expect } from "vitest";

const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3000";

async function timeRequest(url) {
  const start = performance.now();
  const res = await fetch(url);
  const ms = performance.now() - start;
  return { status: res.status, ms };
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { min: sorted[0], max: sorted[sorted.length - 1], mean, p50, p95, p99 };
}

describe("GET /api/movies — performance", () => {
  it("50 sequential requests: p95 under 500ms", async () => {
    const times = [];
    for (let i = 0; i < 50; i++) {
      const { status, ms } = await timeRequest(`${BASE_URL}/api/movies`);
      expect(status).toBe(200);
      times.push(ms);
    }
    const s = stats(times);
    console.log("\n  Sequential (50 requests)");
    console.log(`  min=${s.min.toFixed(1)}ms  mean=${s.mean.toFixed(1)}ms  p50=${s.p50.toFixed(1)}ms  p95=${s.p95.toFixed(1)}ms  p99=${s.p99.toFixed(1)}ms  max=${s.max.toFixed(1)}ms`);
    expect(s.p95).toBeLessThan(500);
  }, 30_000);

  it("20 concurrent requests: p95 under 1000ms", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => timeRequest(`${BASE_URL}/api/movies`)),
    );
    results.forEach(({ status }) => expect(status).toBe(200));
    const s = stats(results.map((r) => r.ms));
    console.log("\n  Concurrent (20 parallel requests)");
    console.log(`  min=${s.min.toFixed(1)}ms  mean=${s.mean.toFixed(1)}ms  p50=${s.p50.toFixed(1)}ms  p95=${s.p95.toFixed(1)}ms  p99=${s.p99.toFixed(1)}ms  max=${s.max.toFixed(1)}ms`);
    expect(s.p95).toBeLessThan(1000);
  }, 15_000);

  it("GET /api/movies?inTheaters=true: p95 under 500ms over 30 requests", async () => {
    const times = [];
    for (let i = 0; i < 30; i++) {
      const { status, ms } = await timeRequest(`${BASE_URL}/api/movies?inTheaters=true`);
      expect(status).toBe(200);
      times.push(ms);
    }
    const s = stats(times);
    console.log("\n  inTheaters filter (30 requests)");
    console.log(`  min=${s.min.toFixed(1)}ms  mean=${s.mean.toFixed(1)}ms  p50=${s.p50.toFixed(1)}ms  p95=${s.p95.toFixed(1)}ms  p99=${s.p99.toFixed(1)}ms  max=${s.max.toFixed(1)}ms`);
    expect(s.p95).toBeLessThan(500);
  }, 20_000);
});
