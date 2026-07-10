# Forge — Production Planning & Supply Chain Optimization

A responsive manufacturing planning website built with React, TypeScript, Vinext and a browser-side linear solver.

## Run

```sh
npm install
npm run dev
npm run build
node --experimental-strip-types lib/planner.test.mjs
```

## Model

Demand is an ordinary least-squares trend fitted to 12 weekly aggregate observations. A fixed 50/30/20 percent product mix and configurable regional weights split forecast demand. The 1, 2, or 4-week horizon is an aggregate planning bucket, not a daily scheduling model.

The browser uses `javascript-lp-solver` for two continuous LP solves: minimize unmet demand, then constrain that optimum and minimize production, inbound freight, outbound freight, and closing inventory holding cost. Inventory is conserved for every product and warehouse. Shared factory capacity, inbound lane capacity, outbound lane capacity and peak warehouse inventory constrain the plan. Opening inventory plus all inbound shipments must fit storage before dispatch; therefore longer horizons can be storage-constrained even if weekly turnover would be feasible.

Transport is priced per unit. Trucks constrain the available aggregate lane payload; displayed whole-truck trip counts are rounded up. Individual item/truck scheduling, fixed truck charges, and delivery-date guarantees are not modeled. Quantities are continuous and displayed rounded; use a mixed-integer solver for executable indivisible-unit schedules.

Opening inventory is assumed usable and split by the same product mix. Product-specific history, stock, and weight/volume are not independently entered in this demo.

The non-optimized baseline uses fixed home warehouse preferences with fallback routing, obeying the same constraints. Its projected service is reported because a greedy baseline may fulfill a different volume. Savings should not be interpreted as an equal-service comparison when those service levels differ.

## Features

- Dashboard with demand outlook and illustrative supply-network diagram
- Editable demand history, regional weights, factory and truck capacities, inventory and storage limits, production and lane transport costs
- Production, warehouse, shipment and regional fulfillment tables
- Normal operations, demand spike, reduced production, warehouse shortage and transport delay scenarios
- CSV plan export
- Session-local inputs; reload restores the illustrative data
- Optional feature-detected WebMCP optimization action; runtime validation unavailable in this environment

This is an interactive planning prototype. No manufacturing system integration or persistent multi-user backend is configured.
