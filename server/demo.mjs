// --demo: 실제 세션 대신 가짜 사람들 — 화면 시험·README 스크린샷용. 10~20초마다 상태가 바뀌고 로그가 자란다.
import { API_VERSION } from './snapshot.mjs';

const LOG_N = 8;
const CAST = [
  { name: 'my-app', commits: 812, sessions: 2, team: [{ name: 'reviewer', type: 'Explore', model: 'opus' }, { name: 'tester', type: 'general-purpose', model: 'sonnet' }] },
  { name: 'api-server', commits: 340, home: 'server' },
  { name: 'docs-site', commits: 23 },
  { name: 'ml-pipeline', commits: 156 },
  { name: 'mobile-client', commits: 1290 },
  { name: 'infra-scripts', commits: 41 },
  { name: 'playground', commits: null },
];
const ACTS = [
  ['read', 'server.mjs'], ['read', 'README.md'], ['edit', 'App.tsx'], ['edit', 'routes.ts'],
  ['write', 'notes.md'], ['bash', 'Run unit tests'], ['bash', 'Install dependencies'],
  ['grep', 'TODO'], ['glob', 'src/**/*.ts'], ['fetch', 'developer.mozilla.org'],
  ['search', 'node fs watch'], ['agent', 'find auth code'], ['todo', ''], ['skill', 'pdf'],
  ['mcp', 'query'], ['tool', 'NotebookRead'], ['text', 'Tests pass now. Next I will clean up the router.'],
];
const ASKS = [
  'Claude needs your permission to use Bash',
  'Bash: npm publish --dry-run',
  'Claude needs your permission to use Write',
  'Claude needs your input',
];
const REPORTS = ['Found 2 issues in auth.ts', 'All 48 tests pass', 'Review notes are ready', 'Flaky test isolated'];
const SUB_TYPES = ['Explore', 'general-purpose', 'Plan'];
const SUB_DESCS = ['find auth code', 'read the test suite', 'check API usage', 'map the folder layout'];

/** 씨앗 고정 난수 — 같은 시각에 열면 같은 장면(스크린샷 재현용) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDemo(seed = 7, start = Date.now()) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const act = () => {
    const [k, a] = pick(ACTS);
    return { k, a };
  };
  const people = CAST.map((c, i) => ({
    ...c,
    // 처음 장면에 승인 대기 1명·쉬는 사람 2명이 꼭 있게
    status: i === 1 ? 'decision' : i === 3 || i === 6 ? 'rest' : 'working',
    ask: i === 1 ? ASKS[0] : '',
    next: start + 10000 + rand() * 10000,
    nextLog: start + 1000 + rand() * 3000,
    log: [],
    subs: [],
  }));
  // 에이전트 팀 — 팀원은 따로 한 명씩(일하는 중·대기만, 승인 요청은 책임자에게 뜬다)
  for (const c of CAST) {
    for (const m of c.team || []) {
      people.push({ name: m.name, type: m.type, model: m.model, lead: c.name, status: 'working', ask: '', commits: null,
                    next: start + 8000 + rand() * 8000, nextLog: start + 1000 + rand() * 3000, log: [], subs: [] });
    }
  }
  for (const p of people) {
    for (let j = 0; j < 4; j++) p.log.push({ at: new Date(start - (4 - j) * 7000).toISOString(), ...act() });
    if (p.status === 'working' && !p.lead && rand() < 0.6) p.subs = makeSubs();
  }
  const leadOf = (p) => people.find((q) => q.name === p.lead);

  function makeSubs() {
    const n = 1 + Math.floor(rand() * 3);
    return Array.from({ length: n }, () => ({
      id: Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0'),
      type: pick(SUB_TYPES),
      desc: pick(SUB_DESCS),
      doing: act(),
    }));
  }

  function step(p, now) {
    while (now >= p.next) {
      const r = rand();
      if (p.lead) {                            // 팀원: 일을 마치면 책임자에게 보고하고 대기
        const done = p.status === 'working' && r < 0.5;
        if (done) {
          const lead = leadOf(p);
          lead.log.push({ at: new Date(p.next).toISOString(), k: 'report', a: `${p.name}: ${pick(REPORTS)}` });
          if (lead.log.length > LOG_N) lead.log.shift();
        }
        p.status = done ? 'rest' : 'working';
        p.next += 8000 + rand() * 8000;
        continue;
      }
      const status = r < 0.55 ? 'working' : r < 0.75 ? 'decision' : 'rest';
      p.status = status;
      p.ask = status === 'decision' ? pick(ASKS) : '';
      p.subs = status === 'working' && rand() < 0.5 ? makeSubs() : [];
      p.next += 10000 + rand() * 10000;
    }
    while (now >= p.nextLog) {
      if (p.status === 'working') {
        p.log.push({ at: new Date(p.nextLog).toISOString(), ...act() });
        if (p.log.length > LOG_N) p.log.shift();
        for (const s of p.subs) if (rand() < 0.5) s.doing = act();
      }
      p.nextLog += 2000 + rand() * 3000;
    }
  }

  return function snapshot(now = Date.now()) {
    return {
      version: API_VERSION,
      now: new Date(now).toISOString(),
      hooks: true,
      demo: true,
      people: people.map((p) => {
        step(p, now);
        const last = p.log[p.log.length - 1];
        const root = `/demo/${p.lead || p.name}`;
        return {
          id: p.lead ? `${root}#demo#${p.name}` : root,
          name: p.name,
          path: root,
          status: p.status,
          pending: p.status === 'decision' ? 1 : 0,
          ask: p.ask,
          sessions: p.sessions || 1,
          source: 'hook',
          commits: p.commits,
          kid: p.commits !== null && p.commits < 50,
          home: p.home || null,
          subs: p.subs.map((s) => ({ ...s })),
          subCount: p.subs.length,
          doing: last ? { k: last.k, a: last.a } : null,
          log: p.log.map((e) => ({ ...e })),
          ...(p.team ? { role: 'lead' } : {}),
          ...(p.lead ? { role: 'teammate', lead: root, type: p.type, model: p.model } : {}),
        };
      }),
    };
  };
}
