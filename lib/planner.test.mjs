import assert from 'node:assert/strict';
import { compute, defaults, scenarios, forecast } from './planner.ts';
const sum = (a) => a.reduce((a, b) => a + b, 0),
  near = (a, b) => assert.ok(Math.abs(a - b) < 0.02, `${a} != ${b}`);
let cases = 0;
async function verify(input, scenario = 'normal', horizon = 1) {
  const r = await compute(input, scenario, horizon);
  cases++;
  assert.ok(r.totalProduction <= r.capacity + 0.01);
  assert.ok(r.service >= -0.001 && r.service <= 100.001);
  assert.ok(Number.isFinite(r.cost) && r.cost >= 0);
  for (const w of r.warehouses) {
    near(w.opening + w.inbound, w.dispatch + w.closing);
    assert.ok(w.opening + w.inbound <= w.storage + 0.01);
    assert.ok(w.inbound <= r.inboundCap + 0.01);
    assert.ok(w.closing >= 0);
  }
  for (const lane of r.lanes) assert.ok(lane.total <= r.laneCap[lane.r] + 0.01);
  for (let p = 0; p < 3; p++) {
    const sent = sum(r.flows.filter((f) => f.p === p).map((f) => f.units));
    assert.ok(
      sent <= r.production[p] + sum(input.stock) * [0.5, 0.3, 0.2][p] + 0.01,
    );
  }
  near(sum(r.flows.map((f) => f.units)) + r.unmet, r.demand);
  for (let reg = 0; reg < 4; reg++)
    near(
      sum(r.flows.filter((f) => f.r === reg).map((f) => f.units)) +
        r.regionService[reg].unmet,
      r.regionService[reg].demand,
    );
  const spend =
    sum(r.production.map((n, p) => n * input.productionCost[p])) +
    sum(
      r.warehouses.map(
        (w, i) =>
          w.inbound * input.inboundCost[i] +
          w.closing * input.holding * horizon,
      ),
    ) +
    sum(r.flows.map((f) => f.units * input.transport[f.w][f.r]));
  near(spend, r.cost);
  if (Math.abs(r.baselineService - r.service) < 0.001)
    assert.ok(r.cost <= r.baselineCost + 0.01);
  return r;
}
for (const s of scenarios)
  for (const h of [1, 2, 4]) await verify(defaults, s.id, h);
const zeroDemand = await verify({ ...defaults, history: Array(12).fill(0) });
near(zeroDemand.totalProduction, 0);
near(zeroDemand.service, 100);
const zeroAll = await verify({
  ...defaults,
  history: Array(12).fill(0),
  stock: [0, 0, 0],
});
near(zeroAll.cost, 0);
const zeroFactory = await verify({ ...defaults, capacity: 0 });
near(zeroFactory.totalProduction, 0);
near(zeroFactory.unmet, zeroFactory.demand - sum(defaults.stock));
const closed = await verify({ ...defaults, trips: 0 });
near(closed.unmet, closed.demand);
const empty = await verify({
  ...defaults,
  stock: [0, 0, 0],
  storage: [0, 0, 0],
});
near(empty.unmet, empty.demand);
const constant = forecast(Array(12).fill(100), 4);
near(constant.total, 400);
near(constant.mae, 0);
await assert.rejects(() => compute({ ...defaults, capacity: -1 }));
await assert.rejects(() => compute(defaults, 'invalid'));
console.log(
  `PASS: ${cases} scenario/horizon/edge-case plans; conservation, capacity, service, cost, and invalid-input checks.`,
);
