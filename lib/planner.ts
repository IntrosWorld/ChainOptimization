export const products = ['Standard pump', 'Precision pump', 'Heavy-duty pump'];
export const warehouses = ['Bhiwandi', 'Delhi NCR', 'Bengaluru'];
export const regions = ['West', 'North', 'East', 'South'];
export const scenarios = [
  {
    id: 'normal',
    label: '01 / BASE PLAN',
    name: 'Normal operations',
    description: 'Your current demand, inventory, and available capacity.',
  },
  {
    id: 'demand',
    label: '02 / DEMAND SHOCK',
    name: 'Demand spike',
    description: 'A sudden 35% increase in demand across all regions.',
  },
  {
    id: 'capacity',
    label: '03 / FACTORY DISRUPTION',
    name: 'Reduced production',
    description: 'Factory capacity drops by 40% for the planning horizon.',
  },
  {
    id: 'warehouse',
    label: '04 / STORAGE CONSTRAINT',
    name: 'Warehouse shortage',
    description:
      'Delhi NCR loses 60% of free receiving space. Existing stock is safe.',
  },
  {
    id: 'transport',
    label: '05 / LOGISTICS DELAY',
    name: 'Transport delay',
    description:
      'Southbound lanes lose 75% of available truck trips in this horizon.',
  },
];
export type Inputs = {
  history: number[];
  capacity: number;
  truckCapacity: number;
  trips: number;
  holding: number;
  stock: number[];
  storage: number[];
  productionCost: number[];
  inboundCost: number[];
  transport: number[][];
  regionShares: number[];
};
export const defaults: Inputs = {
  history: [
    7100, 7700, 7350, 8300, 7850, 8600, 8200, 9150, 8600, 9650, 9250, 10200,
  ],
  capacity: 12000,
  truckCapacity: 800,
  trips: 8,
  holding: 8,
  stock: [1200, 700, 500],
  storage: [6500, 5500, 4500],
  productionCost: [220, 340, 480],
  inboundCost: [12, 48, 36],
  transport: [
    [24, 105, 88, 115],
    [112, 22, 66, 138],
    [110, 145, 92, 26],
  ],
  regionShares: [32, 28, 18, 22],
};
const mix = [0.5, 0.3, 0.2],
  sum = (a: number[]) => a.reduce((a, b) => a + b, 0);
export function forecast(history: number[], horizon = 1) {
  const n = history.length;
  const mx = (n - 1) / 2;
  const my = sum(history) / n;
  const slope =
    history.reduce((s, y, i) => s + (i - mx) * (y - my), 0) /
    history.reduce((s, _, i) => s + (i - mx) ** 2, 0);
  const intercept = my - slope * mx;
  const values = Array.from({ length: horizon }, (_, i) =>
    Math.max(0, Math.round(intercept + slope * (n + i))),
  );
  return {
    total: sum(values),
    values,
    mae: sum(history.map((v, i) => Math.abs(v - intercept - slope * i))) / n,
  };
}
export async function compute(input: Inputs, scenario = 'normal', horizon = 1) {
  if (!scenarios.some((s) => s.id === scenario) || ![1, 2, 4].includes(horizon))
    throw Error('Invalid scenario or horizon.');
  const nums = [
    ...input.history,
    input.capacity,
    input.truckCapacity,
    input.trips,
    input.holding,
    ...input.stock,
    ...input.storage,
    ...input.productionCost,
    ...input.inboundCost,
    ...input.transport.flat(),
    ...input.regionShares,
  ];
  if (
    nums.some((v) => !Number.isFinite(v) || v < 0) ||
    input.truckCapacity <= 0 ||
    sum(input.regionShares) <= 0 ||
    input.stock.some((v, i) => v > input.storage[i])
  )
    throw Error(
      'Enter valid nonnegative inputs; opening inventory must fit storage.',
    );
  const { default: solver } = await import('javascript-lp-solver');
  const total =
    forecast(input.history, horizon).total * (scenario === 'demand' ? 1.35 : 1);
  const shares = input.regionShares.map((v) => v / sum(input.regionShares));
  const demand = shares.map((s) => mix.map((m) => total * s * m));
  const capacity =
    input.capacity * horizon * (scenario === 'capacity' ? 0.6 : 1);
  const storage = input.storage.map((s, w) =>
    scenario === 'warehouse' && w === 1
      ? input.stock[w] + (s - input.stock[w]) * 0.4
      : s,
  );
  const laneCap = regions.map(
    (_, r) =>
      input.truckCapacity *
      Math.floor(
        input.trips *
          horizon *
          (scenario === 'transport' && r === 3 ? 0.25 : 1),
      ),
  );
  const inboundCap = input.truckCapacity * Math.floor(input.trips * horizon);
  const constraints: Record<string, any> = { factory: { max: capacity } };
  const variables: Record<string, Record<string, number>> = {};
  for (let w = 0; w < 3; w++) {
    constraints['storage' + w] = { max: storage[w] - input.stock[w] };
    constraints['inbound' + w] = { max: inboundCap };
    for (let p = 0; p < 3; p++) {
      constraints[`balance${w}${p}`] = { equal: input.stock[w] * mix[p] };
      variables[`x${w}${p}`] = {
        cost: input.productionCost[p] + input.inboundCost[w],
        factory: 1,
        ['storage' + w]: 1,
        ['inbound' + w]: 1,
        [`balance${w}${p}`]: -1,
      };
      variables[`e${w}${p}`] = {
        cost: input.holding * horizon,
        [`balance${w}${p}`]: 1,
      };
    }
    for (let r = 0; r < 4; r++) {
      constraints[`lane${w}${r}`] = { max: laneCap[r] };
      for (let p = 0; p < 3; p++)
        variables[`y${w}${r}${p}`] = {
          cost: input.transport[w][r],
          [`balance${w}${p}`]: 1,
          [`demand${r}${p}`]: 1,
          [`lane${w}${r}`]: 1,
        };
    }
  }
  for (let r = 0; r < 4; r++)
    for (let p = 0; p < 3; p++) {
      constraints[`demand${r}${p}`] = { equal: demand[r][p] };
      variables[`u${r}${p}`] = {
        shortage: 1,
        unmetLimit: 1,
        [`demand${r}${p}`]: 1,
      };
    }
  const first: any = solver.Solve({
    optimize: 'shortage',
    opType: 'min',
    constraints,
    variables,
  });
  if (!first.feasible)
    throw Error('No feasible plan. Review storage and inventory inputs.');
  constraints.unmetLimit = { max: Math.max(0, first.result) + 0.000001 };
  const solved: any = solver.Solve({
    optimize: 'cost',
    opType: 'min',
    constraints,
    variables,
  });
  if (!solved.feasible || !solved.bounded)
    throw Error('Optimization did not converge. Review your input ranges.');
  const get = (k: string) => Math.max(0, Number((solved as any)[k] || 0));
  const production = mix.map((_, p) =>
    sum(warehouses.map((_, w) => get(`x${w}${p}`))),
  );
  const flows = warehouses.flatMap((_, w) =>
    regions.flatMap((_, r) =>
      products.map((_, p) => ({ w, r, p, units: get(`y${w}${r}${p}`) })),
    ),
  );
  const ws = warehouses.map((_, w) => {
    const inbound = sum(mix.map((_, p) => get(`x${w}${p}`)));
    const dispatch = sum(flows.filter((f) => f.w === w).map((f) => f.units));
    const closing = sum(mix.map((_, p) => get(`e${w}${p}`)));
    return {
      opening: input.stock[w],
      inbound,
      dispatch,
      closing,
      storage: storage[w],
      utilization: storage[w]
        ? (100 * (input.stock[w] + inbound)) / storage[w]
        : 0,
    };
  });
  const unmet = sum(
    regions.flatMap((_, r) => mix.map((_, p) => get(`u${r}${p}`))),
  );
  // Feasible non-optimized reference: fixed home warehouse, then alternatives;
  // consumes opening stock first and respects the same peak-storage and lane limits.
  const stock = input.stock.map((v) => mix.map((m) => v * m));
  const room = storage.map((v, w) => v - input.stock[w]);
  const inRoom = warehouses.map(() => inboundCap);
  const outRoom = warehouses.map(() => [...laneCap]);
  let factoryRoom = capacity,
    baseCost = 0,
    baseServed = 0;
  for (let r = 0; r < 4; r++)
    for (let p = 0; p < 3; p++) {
      let need = demand[r][p];
      const home = [0, 1, 1, 2][r];
      const order = [home, ...[0, 1, 2].filter((w) => w !== home)];
      for (const w of order) {
        const amount = Math.max(0, Math.min(need, stock[w][p], outRoom[w][r]));
        stock[w][p] -= amount;
        outRoom[w][r] -= amount;
        need -= amount;
        baseServed += amount;
        baseCost += amount * input.transport[w][r];
      }
      for (const w of order) {
        const amount = Math.max(
          0,
          Math.min(need, factoryRoom, room[w], inRoom[w], outRoom[w][r]),
        );
        factoryRoom -= amount;
        room[w] -= amount;
        inRoom[w] -= amount;
        outRoom[w][r] -= amount;
        need -= amount;
        baseServed += amount;
        baseCost +=
          amount *
          (input.productionCost[p] +
            input.inboundCost[w] +
            input.transport[w][r]);
      }
    }
  baseCost += sum(stock.flat()) * input.holding * horizon;
  const lanes = warehouses.flatMap((_, w) =>
    regions.map((_, r) => {
      const quantities = products.map((_, p) => get(`y${w}${r}${p}`));
      return { w, r, products: quantities, total: sum(quantities) };
    }),
  );
  const regionService = regions.map((_, r) => {
    const d = sum(demand[r]);
    const u = sum(mix.map((_, p) => get(`u${r}${p}`)));
    return { demand: d, unmet: u, service: d ? (100 * (d - u)) / d : 100 };
  });
  return {
    demand: total,
    demandByRegionProduct: demand,
    capacity,
    production,
    totalProduction: sum(production),
    flows,
    warehouses: ws,
    unmet,
    service: total ? (100 * (total - unmet)) / total : 100,
    cost: solved.result,
    baselineCost: baseCost,
    baselineService: total ? (baseServed / total) * 100 : 100,
    savings: baseCost ? (100 * (baseCost - solved.result)) / baseCost : 0,
    lanes,
    regionService,
    laneCap,
    inboundCap,
    scenario,
    horizon,
  };
}
