'use client';
import { useState, useEffect } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Download,
  Factory,
  FlaskConical,
  LayoutDashboard,
  Network,
  Settings2,
  ShieldCheck,
  Sparkles,
  Truck,
  Warehouse,
  X,
} from 'lucide-react';
import {
  defaults,
  compute,
  forecast,
  products,
  warehouses,
  regions,
  scenarios,
  type Inputs,
} from '../lib/planner';
const nav = [
  ['Overview', LayoutDashboard],
  ['Demand forecast', BarChart3],
  ['Production plan', Factory],
  ['Inventory & warehouses', Warehouse],
  ['Shipment plan', Truck],
  ['Scenario lab', FlaskConical],
] as const;
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
const money = (n: number) => '₹' + (n / 100000).toFixed(2) + 'L';
export default function Home() {
  const [tab, setTab] = useState('Overview'),
    [input, setInput] = useState<Inputs>(defaults),
    [draft, setDraft] = useState<Inputs>(defaults),
    [historyText, setHistoryText] = useState(defaults.history.join(', ')),
    [scenario, setScenario] = useState('normal'),
    [drawer, setDrawer] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [product, setProduct] = useState('all'),
    [horizon, setHorizon] = useState(1),
    [result, setResult] = useState<any>(null),
    [lastRun, setLastRun] = useState('');
  const run = async (data = input, sc = scenario, h = horizon) => {
    setBusy(true);
    setError('');
    try {
      const r = await compute(data, sc, h);
      setResult(r);
      setLastRun(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    } catch (e) {
      setResult(null);
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to compute plan. Check inputs.',
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(defaults, 'normal', 1);
  }, []);
  useEffect(() => {
    if (!drawer) return;
    setHistoryText(draft.history.join(', '));
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(false);
      if (event.key !== 'Tab') return;
      const items = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button, input, textarea, select',
        ) ?? [],
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [drawer]);
  const chooseScenario = (s: string) => {
    setScenario(s);
    void run(input, s, horizon);
  };
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const abort = new AbortController();
    try {
      Promise.resolve(
        ctx.registerTool(
          {
            name: 'optimize_supply_plan',
            description:
              'Recompute and display the production and distribution plan for a named disruption scenario.',
            inputSchema: {
              type: 'object',
              properties: {
                scenario: { type: 'string', enum: scenarios.map((s) => s.id) },
              },
              required: ['scenario'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: async (value: any) => {
              if (!scenarios.some((s) => s.id === value?.scenario))
                throw Error('Unknown scenario');
              const next = await compute(input, value.scenario, horizon);
              setScenario(value.scenario);
              setResult(next);
              return {
                service: next.service,
                cost: next.cost,
                unmet: next.unmet,
              };
            },
          },
          { signal: abort.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => abort.abort();
  }, [input, horizon]);
  const exportPlan = () => {
    if (!result) return;
    const rows = [
      ['Type', 'Product', 'From', 'To', 'Units'],
      ...result.production.map((v: number, p: number) => [
        'Production',
        products[p],
        'Pune plant',
        '',
        fmt(v).replaceAll(',', ''),
      ]),
      ...result.flows
        .filter((f: any) => f.units > 0.01)
        .map((f: any) => [
          'Shipment',
          products[f.p],
          warehouses[f.w],
          regions[f.r],
          Math.round(f.units),
        ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], {
      type: 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forge-' + scenario + '-plan.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const r = result;
  const fs = forecast(input.history, horizon);
  const selected = scenarios.find((s) => s.id === scenario)!;
  const metricData = r
    ? [
        [
          'Forecast demand',
          fmt(r.demand),
          'finished units to serve',
          BarChart3,
        ],
        [
          'Recommended production',
          fmt(r.totalProduction),
          `${((100 * r.totalProduction) / Math.max(1, r.capacity)).toFixed(1)}% of factory capacity`,
          Factory,
        ],
        [
          'Projected service level',
          r.service.toFixed(1) + '%',
          `${fmt(r.unmet)} units unmet`,
          ShieldCheck,
        ],
        [
          'Estimated plan savings',
          r.savings.toFixed(1) + '%',
          'vs. fixed-route baseline',
          ArrowDownRight,
        ],
      ]
    : [];
  const series =
    product === 'all'
      ? input.history
      : input.history.map((v) => v * [0.5, 0.3, 0.2][Number(product)]);
  const predicted =
    fs.values[0] *
    (scenario === 'demand' ? 1.35 : 1) *
    (product === 'all' ? 1 : [0.5, 0.3, 0.2][Number(product)]);
  const max = Math.max(...series, predicted) * 1.18;
  const points = series
    .map((v, i) => `${48 + i * 43},${185 - (v / max) * 150}`)
    .join(' ');
  const end = 48 + (series.length - 1) * 43;
  const forecastY = 185 - (predicted / max) * 150;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Network size={23} />
          </span>
          forge<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">A</span>
          <div>
            Acme Manufacturing<small>Operations workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              aria-label={name}
              onClick={() => setTab(name)}
              className={tab === name ? 'active' : ''}
            >
              <Icon size={19} />
              {name}
              {name === 'Scenario lab' && <span className="nav-new">NEW</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-card">
            <span className="live-dot" />
            Planning engine online<small>Ready for your next decision.</small>
          </div>
          <button
            onClick={() => {
              setDraft(structuredClone(input));
              setDrawer(true);
            }}
          >
            <Settings2 size={18} />
            Planning inputs
          </button>
          <div className="profile">
            <span>JD</span>
            <div>
              Jamie Davis<small>Operations manager</small>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            Workspace <span>/</span> <b>{tab}</b>
          </div>
          <div className="topbar-right">
            <span className="demo">DEMO WORKSPACE</span>
            <span className="avatar">JD</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR OPERATIONS, IN SYNC</div>
              <h1>{tab === 'Overview' ? 'Planning overview' : tab}</h1>
              <p>
                A clearer view of demand. A smarter plan for what comes next.
              </p>
            </div>
            <div className="heading-actions">
              <button className="button" onClick={exportPlan} disabled={!r}>
                <Download size={16} />
                Export plan
              </button>
              <button
                className="button primary"
                onClick={() => run()}
                disabled={busy}
              >
                <Sparkles size={16} />
                {busy ? 'Optimizing…' : 'Run optimization'}
              </button>
            </div>
          </div>
          <div className="toolbar">
            <div className="filters">
              <label className="select-control">
                <CalendarDays size={16} />
                <select
                  aria-label="Planning horizon"
                  value={horizon}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setHorizon(h);
                    void run(input, scenario, h);
                  }}
                >
                  <option value={1}>Sep 7 – 13, 2026</option>
                </select>
              </label>
              <label className="select-control">
                <select
                  aria-label="Forecast product"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                >
                  <option value="all">All products</option>
                  {products.map((p, i) => (
                    <option key={p} value={i}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button"
                aria-label="Edit planning inputs"
                onClick={() => {
                  setDraft(structuredClone(input));
                  setDrawer(true);
                }}
              >
                <Settings2 size={15} />
              </button>
              <span className="divider" />
              <span className="subtle">{horizon}-week planning horizon</span>
            </div>
            <span className="status">
              <span className="live-dot" />
              {busy
                ? 'Calculating plan'
                : lastRun
                  ? 'Updated ' + lastRun
                  : 'Preparing plan'}
            </span>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <div className="insight">
            <span className="insight-icon">
              <Sparkles size={22} />
            </span>
            <div>
              <b>
                {r
                  ? r.unmet > 1
                    ? `${fmt(r.unmet)} units need your attention.`
                    : `Your network can meet ${fmt(r.demand)} units of demand.`
                  : 'Your network has room to work smarter.'}
              </b>
              <p>
                {r
                  ? `${selected.name}. ${r.unmet > 1 ? 'Capacity constraints leave some forecast demand unserved. Explore a different scenario.' : `The recommended plan saves ${money(r.baselineCost - r.cost)} against a feasible fixed-route plan.`}`
                  : 'Forecast demand, balance inventory, and find efficient routes in one plan.'}
              </p>
            </div>
            <span className="insight-tag">
              <ShieldCheck size={15} />
              Constraint-aware planning
            </span>
          </div>
          <div className="metric-grid">
            {metricData.map(([label, value, note, Icon]: any, i) => (
              <div
                className={'metric ' + (i === 3 ? 'savings' : '')}
                key={label}
              >
                <div>
                  {label}
                  <Icon size={18} />
                </div>
                <strong>{value}</strong>
                <small>
                  <span className="positive">
                    {i === 0
                      ? 'Trend forecast'
                      : i === 1
                        ? 'Production plan'
                        : i === 2
                          ? 'Projected fulfillment'
                          : 'Operating cost'}
                  </span>{' '}
                  · {note}
                </small>
              </div>
            ))}
          </div>
          {['Overview', 'Demand forecast'].includes(tab) && (
            <div className="dashboard-grid">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Demand outlook</h2>
                    <p>Historical demand meets the next best prediction.</p>
                  </div>
                  <span className="chip">12 weeks of history</span>
                </div>
                <div className="chart-legend">
                  <span>
                    <i />
                    Actual demand
                  </span>
                  <span>
                    <i className="forecast-dot" />
                    Forecast
                  </span>
                  <span className="subtle">Units / week</span>
                </div>
                <svg
                  className="demand-chart"
                  viewBox="0 0 660 220"
                  role="img"
                  aria-label="Historical weekly demand and scenario-adjusted linear trend forecast"
                >
                  {[40, 90, 140, 190].map((y, i) => (
                    <g key={y}>
                      <line x1="46" x2="640" y1={y} y2={y} stroke="#edf0ef" />
                      <text x="2" y={y + 4}>
                        {((((185 - y) / 150) * max) / 1000).toFixed(0)}k
                      </text>
                    </g>
                  ))}
                  <defs>
                    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#249a73" stopOpacity=".18" />
                      <stop offset="100%" stopColor="#249a73" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon
                    points={`48,190 ${points} ${end},190`}
                    fill="url(#area)"
                  />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#258268"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M${end} ${185 - (series.at(-1)! / max) * 150}L625 ${forecastY}`}
                    fill="none"
                    stroke="#258268"
                    strokeWidth="2.5"
                    strokeDasharray="5 5"
                  />
                  <circle cx="625" cy={forecastY} r="4" fill="#258268" />
                  {[
                    'Jun 15',
                    'Jun 29',
                    'Jul 13',
                    'Jul 27',
                    'Aug 10',
                    'Aug 24',
                    'Next',
                  ].map((d, i) => (
                    <text key={d} x={38 + i * 95} y="215">
                      {d}
                    </text>
                  ))}
                </svg>
                <div className="chart-foot">
                  <span>
                    <Activity size={15} />
                    Linear trend · product mix 50 / 30 / 20%
                  </span>
                  <button
                    onClick={() =>
                      setTab(
                        tab === 'Overview' ? 'Demand forecast' : 'Overview',
                      )
                    }
                  >
                    {tab === 'Overview'
                      ? 'Explore forecast'
                      : 'Back to overview'}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Your supply network</h2>
                    <p>One factory. Three warehouses. Network schematic.</p>
                  </div>
                  <Network size={19} />
                </div>
                <div className="network-canvas">
                  <div className="network-labels">
                    <span>PRODUCTION</span>
                    <span>DISTRIBUTION</span>
                    <span>DEMAND</span>
                  </div>
                  <svg
                    viewBox="0 0 500 205"
                    className="flow-lines"
                    aria-hidden="true"
                  >
                    <path d="M75 102 C145 102 130 35 240 35 M75 102H240 M75 102C145 102 130 172 240 172 M260 35C340 35 340 25 430 25 M260 35C340 35 340 76 430 76 M260 102C340 102 340 127 430 127 M260 172C340 172 340 178 430 178" />
                  </svg>
                  <div className="factory-node">
                    <span>
                      <Factory size={24} />
                    </span>
                    <b>Pune plant</b>
                    <small>{r ? fmt(r.totalProduction) : '—'} units</small>
                  </div>
                  <div className="warehouse-nodes">
                    {warehouses.map((n) => (
                      <div key={n}>
                        <Warehouse size={17} />
                        <span>{n}</span>
                        <i />
                      </div>
                    ))}
                  </div>
                  <div className="region-nodes">
                    {regions.map((n) => (
                      <div key={n}>
                        <span className="region-dot" />
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="chart-foot">
                  <span>
                    <span className="live-dot" />
                    {scenario === 'normal'
                      ? 'All nodes operational'
                      : selected.name}
                  </span>
                  <span>4 demand regions</span>
                </div>
              </section>
            </div>
          )}
          {tab === 'Demand forecast' && (
            <section className="panel detail">
              <h2>Forecast methodology</h2>
              <p>
                Ordinary least-squares trend fitted to 12 weekly demand
                observations. Product demand uses a fixed 50 / 30 / 20% mix;
                regional shares are configurable. This demo does not infer
                SKU-level patterns from aggregate history. Forecasts are
                estimates, not booked orders.
              </p>
              <div className="mini-grid">
                <div>
                  <small>Horizon forecast</small>
                  <strong>
                    {fmt(
                      fs.total *
                        (scenario === 'demand' ? 1.35 : 1) *
                        (product === 'all'
                          ? 1
                          : [0.5, 0.3, 0.2][Number(product)]),
                    )}{' '}
                    units
                  </strong>
                </div>
                <div>
                  <small>Last observed week</small>
                  <strong>
                    {fmt(
                      input.history.at(-1)! *
                        (product === 'all'
                          ? 1
                          : [0.5, 0.3, 0.2][Number(product)]),
                    )}{' '}
                    units
                  </strong>
                </div>
                <div>
                  <small>In-sample mean absolute error</small>
                  <strong>
                    {fmt(
                      fs.mae *
                        (product === 'all'
                          ? 1
                          : [0.5, 0.3, 0.2][Number(product)]),
                    )}{' '}
                    units
                  </strong>
                </div>
              </div>
              <button
                className="button"
                onClick={() => {
                  setDraft(structuredClone(input));
                  setDrawer(true);
                }}
              >
                Edit demand history <ArrowRight size={15} />
              </button>
            </section>
          )}
          {r && ['Overview', 'Inventory & warehouses'].includes(tab) && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Warehouse allocation</h2>
                  <p>Keep the right inventory, in the right place.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setDraft(structuredClone(input));
                    setDrawer(true);
                  }}
                >
                  Edit inventory <ArrowRight size={15} />
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Warehouse</th>
                      <th>Opening stock</th>
                      <th>Planned inbound</th>
                      <th>Planned dispatch</th>
                      <th>Closing stock</th>
                      <th>Peak storage use</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.warehouses.map((w: any, i: number) => (
                      <tr key={i}>
                        <td>
                          <div className="warehouse-cell">
                            <span>
                              <Warehouse size={18} />
                            </span>
                            <div>
                              <b>{warehouses[i]}</b>
                              <small>
                                {['Maharashtra', 'Haryana', 'Karnataka'][i]}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>{fmt(w.opening)}</td>
                        <td>{fmt(w.inbound)}</td>
                        <td>{fmt(w.dispatch)}</td>
                        <td>{fmt(w.closing)}</td>
                        <td>
                          <div className="capacity">
                            <div>
                              <i
                                style={{
                                  width: Math.min(100, w.utilization) + '%',
                                }}
                              />
                            </div>
                            {w.utilization.toFixed(0)}%
                          </div>
                        </td>
                        <td>
                          <span
                            className={
                              w.utilization > 95 ? 'warning' : 'healthy'
                            }
                          >
                            {w.utilization > 95 ? 'Near capacity' : 'Healthy'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {r && tab === 'Production plan' && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Pune factory · recommended output</h2>
                  <p>
                    Shared capacity: {fmt(r.capacity)} finished units over this
                    horizon.
                  </p>
                </div>
                <Factory size={22} />
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Production</th>
                    <th>Unit production cost</th>
                    <th>Production spend</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p}>
                      <td>{p}</td>
                      <td>{fmt(r.production[i])}</td>
                      <td>₹{input.productionCost[i]}</td>
                      <td>
                        {money(r.production[i] * input.productionCost[i])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="detail">
                <h2>Capacity utilization</h2>
                <div className="wide-bar">
                  <i
                    style={{
                      width:
                        Math.min(
                          100,
                          (r.totalProduction / Math.max(1, r.capacity)) * 100,
                        ) + '%',
                    }}
                  />
                </div>
                <p>
                  {fmt(r.totalProduction)} / {fmt(r.capacity)} units ·{' '}
                  {(
                    (100 * r.totalProduction) /
                    Math.max(1, r.capacity)
                  ).toFixed(1)}
                  % utilized
                </p>
              </div>
            </section>
          )}
          {r && tab === 'Shipment plan' && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Warehouse → region dispatch</h2>
                  <p>
                    Truck capacity is enforced per lane. Counts show minimum
                    whole trips at {fmt(input.truckCapacity)} units per truck.
                  </p>
                </div>
                <button className="button" onClick={exportPlan}>
                  <Download size={15} />
                  CSV
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Origin</th>
                      <th>Destination</th>
                      <th>Standard pump</th>
                      <th>Precision pump</th>
                      <th>Heavy-duty pump</th>
                      <th>Truck trips</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.lanes
                      .filter((l: any) => l.total > 0.01)
                      .map((l: any) => (
                        <tr key={l.w + '-' + l.r}>
                          <td>{warehouses[l.w]}</td>
                          <td>{regions[l.r]}</td>
                          {l.products.map((n: number, i: number) => (
                            <td key={i}>{fmt(n)}</td>
                          ))}
                          <td>
                            {Math.ceil((l.total - 0.001) / input.truckCapacity)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="detail">
                <h2>Region fulfillment</h2>
                <div className="mini-grid">
                  {r.regionService.map((v: any, i: number) => (
                    <div key={i}>
                      <small>{regions[i]}</small>
                      <strong>{v.service.toFixed(1)}%</strong>
                      <p>{fmt(v.unmet)} units unmet</p>
                    </div>
                  ))}
                </div>
                <p>
                  Transport delays reduce dispatch capacity within this horizon.
                  Service is projected quantity fulfillment, not a dated
                  delivery guarantee.
                </p>
              </div>
            </section>
          )}
          {tab === 'Scenario lab' && (
            <>
              <section className="scenario-intro">
                <span className="lab-icon">
                  <FlaskConical size={30} />
                </span>
                <div>
                  <h2>What happens if the plan changes?</h2>
                  <p>
                    Choose a disruption. Forge forecasts the impact and
                    recomputes the least-cost plan.
                  </p>
                </div>
              </section>
              <div className="scenario-grid">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    className={
                      'scenario-option ' + (scenario === s.id ? 'selected' : '')
                    }
                    disabled={busy}
                    onClick={() => chooseScenario(s.id)}
                  >
                    <span>{s.label}</span>
                    <h2>{s.name}</h2>
                    <p>{s.description}</p>
                    <div>
                      {scenario === s.id
                        ? 'Active scenario'
                        : 'Simulate scenario'}
                      <ArrowUpRight size={16} />
                    </div>
                  </button>
                ))}
              </div>
              {r && (
                <section className="panel detail">
                  <h2>Scenario outcome · {selected.name}</h2>
                  <div className="mini-grid">
                    <div>
                      <small>Unserved demand</small>
                      <strong>{fmt(r.unmet)} units</strong>
                    </div>
                    <div>
                      <small>Operating cost</small>
                      <strong>{money(r.cost)}</strong>
                    </div>
                    <div>
                      <small>Factory utilization</small>
                      <strong>
                        {(
                          (r.totalProduction / Math.max(1, r.capacity)) *
                          100
                        ).toFixed(1)}
                        %
                      </strong>
                    </div>
                  </div>
                  <p>
                    Each scenario is solved independently from the same inputs.
                    Existing warehouse inventory remains usable. Storage
                    constraints cover opening stock plus all inbound
                    replenishment before dispatch.
                  </p>
                </section>
              )}
            </>
          )}
          {r && tab !== 'Overview' && (
            <section className="panel detail cost-panel">
              <h2>Cost comparison · same demand and constraints</h2>
              <div className="cost-row">
                <span>Optimized plan</span>
                <div>
                  <i
                    style={{
                      width:
                        Math.min(100, (100 * r.cost) / r.baselineCost) + '%',
                    }}
                  />
                </div>
                <b>{money(r.cost)}</b>
              </div>
              <div className="cost-row baseline">
                <span>Fixed-route baseline</span>
                <div>
                  <i style={{ width: '100%' }} />
                </div>
                <b>{money(r.baselineCost)}</b>
              </div>
              <p>
                Illustrative baseline uses Bhiwandi for West, Delhi for
                North/East, and Bengaluru for South, with fallback routing.
                Savings compare production, closing-stock holding, and per-unit
                transport costs. With shortages, product and regional
                fulfillment can differ even at the same aggregate service.
                Baseline service: {r.baselineService.toFixed(1)}%; optimized
                service: {r.service.toFixed(1)}%.{' '}
                {Math.abs(r.service - r.baselineService) > 0.01
                  ? 'Service levels differ; cost savings alone are not a like-for-like service comparison.'
                  : ''}
              </p>
            </section>
          )}
          {tab === 'Overview' && (
            <div className="bottom-grid">
              <section className="scenario-banner">
                <span className="lab-icon">
                  <FlaskConical size={24} />
                </span>
                <div>
                  <h2>Plan for the unexpected.</h2>
                  <p>Stress-test your network before a disruption hits.</p>
                </div>
                <button
                  className="button"
                  onClick={() => setTab('Scenario lab')}
                >
                  Open scenario lab <ArrowUpRight size={16} />
                </button>
              </section>
              <div className="planning-note">
                <ShieldCheck size={22} />
                <div>
                  <b>A plan you can explain</b>
                  <p>Built around your operational constraints.</p>
                </div>
              </div>
            </div>
          )}
          <footer>
            <span>
              <span className="live-dot" />
              Forge planning intelligence
            </span>
            <span>
              Illustrative data · INR · Finished units · Continuous linear
              optimization
            </span>
          </footer>
        </div>
      </main>
      {drawer && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawer(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="input-title"
            className="modal"
          >
            <button
              className="close"
              onClick={() => setDrawer(false)}
              aria-label="Close inputs"
            >
              <X />
            </button>
            <h2 id="input-title">Planning inputs</h2>
            <p>
              Changes apply to this session. Factory capacity and trips are
              weekly. Storage is a fixed physical limit; all replenishment
              arrives before dispatch.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  draft.history.length !== 12 ||
                  draft.history.some((n) => !Number.isFinite(n) || n < 0)
                ) {
                  setError(
                    'Enter exactly 12 nonnegative weekly demand values.',
                  );
                  return;
                }
                if (draft.stock.some((n, i) => n > draft.storage[i])) {
                  setError('Opening stock cannot exceed warehouse storage.');
                  return;
                }
                setInput(structuredClone(draft));
                setDrawer(false);
                void run(draft);
              }}
            >
              <label className="field">
                Historical demand · 12 weeks, comma separated
                <textarea
                  value={historyText}
                  onChange={(e) => {
                    setHistoryText(e.target.value);
                    setDraft({
                      ...draft,
                      history: e.target.value
                        .split(',')
                        .map((v) => (v.trim() === '' ? NaN : Number(v.trim()))),
                    });
                  }}
                />
              </label>
              <div className="form-grid">
                {[
                  ['capacity', 'Factory capacity · units', 100],
                  ['truckCapacity', 'Truck capacity · units', 1],
                  ['trips', 'Trips per lane / week', 1],
                  ['holding', 'Holding cost · ₹ / unit / week', 0],
                ].map(([key, label, min]) => (
                  <label className="field" key={key}>
                    {label}
                    <input
                      required
                      type="number"
                      min={min}
                      max={1000000}
                      step="any"
                      value={(draft as any)[key]}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <h3>Regional demand weights · normalized to 100%</h3>
              <div className="form-grid">
                {regions.map((reg, i) => (
                  <label className="field" key={reg}>
                    {reg}
                    <input
                      required
                      type="number"
                      min="0"
                      max="1000"
                      value={draft.regionShares[i]}
                      onChange={(e) => {
                        const values = [...draft.regionShares];
                        values[i] = Number(e.target.value);
                        setDraft({ ...draft, regionShares: values });
                      }}
                    />
                  </label>
                ))}
              </div>
              <h3>Warehouses</h3>
              <div className="input-table">
                <div>Warehouse</div>
                <div>Opening stock</div>
                <div>Storage limit</div>
                {warehouses.map((w, i) => (
                  <div className="input-row" key={w}>
                    <span>{w}</span>
                    {['stock', 'storage'].map((key) => (
                      <input
                        key={key}
                        aria-label={w + ' ' + key}
                        required
                        type="number"
                        min="0"
                        max="1000000"
                        value={(draft as any)[key][i]}
                        onChange={(e) => {
                          const values = [...(draft as any)[key]];
                          values[i] = Number(e.target.value);
                          setDraft({ ...draft, [key]: values });
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <h3>Product production costs · ₹ per unit</h3>
              <div className="form-grid three">
                {products.map((p, i) => (
                  <label className="field" key={p}>
                    {p}
                    <input
                      required
                      type="number"
                      min="0"
                      max="100000"
                      value={draft.productionCost[i]}
                      onChange={(e) => {
                        const values = [...draft.productionCost];
                        values[i] = Number(e.target.value);
                        setDraft({ ...draft, productionCost: values });
                      }}
                    />
                  </label>
                ))}
              </div>
              <h3>Factory → warehouse transport · ₹ per unit</h3>
              <div className="form-grid three">
                {warehouses.map((w, i) => (
                  <label className="field" key={w}>
                    {w}
                    <input
                      required
                      type="number"
                      min="0"
                      max="100000"
                      value={draft.inboundCost[i]}
                      onChange={(e) => {
                        const values = [...draft.inboundCost];
                        values[i] = Number(e.target.value);
                        setDraft({ ...draft, inboundCost: values });
                      }}
                    />
                  </label>
                ))}
              </div>
              <h3>Warehouse → region transport · ₹ per unit</h3>
              <div className="transport-grid">
                <span />
                {regions.map((n) => (
                  <small key={n}>{n}</small>
                ))}
                {warehouses.map((w, i) => (
                  <div className="input-row" key={w}>
                    <small>{w}</small>
                    {regions.map((reg, j) => (
                      <input
                        aria-label={w + ' to ' + reg + ' cost'}
                        key={reg}
                        required
                        type="number"
                        min="0"
                        max="100000"
                        value={draft.transport[i][j]}
                        onChange={(e) => {
                          const values = draft.transport.map((row) => [...row]);
                          values[i][j] = Number(e.target.value);
                          setDraft({ ...draft, transport: values });
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setDraft(structuredClone(defaults));
                    setHistoryText(defaults.history.join(', '));
                    setError('');
                  }}
                >
                  Reset demo inputs
                </button>
                <button type="submit" className="button primary">
                  <Sparkles size={16} />
                  Apply & optimize
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
