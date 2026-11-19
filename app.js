const state = {
  analysis: null,
  numberArea: "front",
  numberMetric: "count_100",
  showAllModels: false,
  quantBudget: "20",
  jackpotYears: 1,
  multiData: null,
  selectedGame: "dlt",
  multiTicketCount: 3,
  ticketImageData: null,
  betPackage: null,
  recentFiveGame: "dlt",
  screeningReport: null,
  researchAudit: null,
  recentFiveCache: null,
};

let analysisRequest = null;
let multiRequest = null;
let researchRequest = null;
const multiGameRequests = new Map();
let loadingRequests = 0;
const RUNTIME = window.LOTTERY_RUNTIME || { staticMode: false };

const numberFormatter = new Intl.NumberFormat("zh-CN");
const chartTheme = {
  accent: "#52e1ce",
  baseline: "#d7f7f3",
  muted: "#77909a",
  subdued: "#58737e",
  line: "#18333e",
  text: "#7f9aa4",
};
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? value : dateFormatter.format(date);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatBrier(value) {
  return Number(value).toFixed(6);
}

function formatBps(value) {
  return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)} bp`;
}

function formatMoney(value) {
  const number = Number(value);
  return `${number < 0 ? "−" : ""}¥${Math.abs(number).toFixed(2)}`;
}

function formatRate(value) {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatSmallProbability(value) {
  const probability = Number(value);
  if (probability === 0) return "0%";
  if (probability < 0.001) return `${(probability * 100).toFixed(5)}%`;
  return formatRate(probability);
}

function formatInteger(value) {
  return numberFormatter.format(Number(value));
}

function formatOneIn(probability) {
  const value = Number(probability);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1) return "1 / 1";
  return `1 / ${formatInteger(Math.round(1 / value))}`;
}

function formatCoverage(value) {
  const probability = Number(value);
  if (!Number.isFinite(probability)) return "—";
  if (probability === 0) return "0";
  if (probability < 0.000001) return probability.toExponential(5);
  return `${(probability * 100).toFixed(8)}%`;
}

function balls(numbers, backNumbers = [], small = false) {
  const front = numbers
    .map((number) => `<span class="ball${small ? " small" : ""}">${String(number).padStart(2, "0")}</span>`)
    .join("");
  const back = backNumbers
    .map((number) => `<span class="ball back${small ? " small" : ""}">${String(number).padStart(2, "0")}</span>`)
    .join("");
  return `${front}${back}`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
}

function populateVerdict(data) {
  const selection = data.selection;
  const validation = data.validation;
  const regime = data.regime;
  const passed = Boolean(selection.passes_gate);
  const mark = $("#verdict-mark");
  mark.classList.toggle("is-pass", passed);
  mark.classList.toggle("is-fail", !passed);
  mark.classList.remove("is-pending");
  setText(
    "#verdict-headline",
    passed
      ? "本期判定：候选模型通过门槛，仍需独立留出复核"
      : "本期判定：未通过门槛，采用均匀基线"
  );
  setText(
    "#verdict-summary",
    `开发集 ${formatBps(selection.development_gain_bps)} · 95% CI ${formatBps(selection.development_ci_low_bps)} 至 ${formatBps(selection.development_ci_high_bps)}${
      regime
        ? ` · 五期状态机：${regime.selected.name}，留出 ${formatBps(regime.selected.holdout_gain_bps)}`
        : ""
    }`
  );
  setText("#evidence-draws", `${formatInteger(data.source.draw_count)} 期`);
  setText(
    "#evidence-development",
    `${formatInteger(validation.development_draws)} 期`
  );
  setText(
    "#evidence-holdout",
    `${formatInteger(validation.holdout_draws)} 期`
  );
  setText(
    "#evidence-candidates",
    `${formatInteger(validation.candidate_count)} 组`
  );
  setText(
    "#evidence-ci",
    `${formatBps(selection.development_ci_low_bps)} 至 ${formatBps(selection.development_ci_high_bps)}`
  );
  setText("#evidence-selected", selection.model);
  setText("#evidence-reason", selection.reason);
}

function populateDecisionTree(data) {
  const selection = data.selection;
  setText("#tree-issue", data.source.next_issue);
  setText("#tree-date", formatDate(data.source.next_date));
  setText(
    "#tree-state",
    selection.passes_gate
      ? "五类彩票独立分析；大乐透候选通过门槛"
      : "五类彩票独立分析；大乐透采用均匀基线"
  );
  setText("#tree-game-count", "5");
  setText("#tree-model-count", "4");
  setText("#tree-validation-count", "5套");
  if (state.multiData) populateGameTree(data, state.multiData);
}

const GAME_TREE_META = {
  dlt: { code: "DLT", name: "大乐透", rule: "35选5 + 12选2" },
  ssq: { code: "SSQ", name: "双色球", rule: "33选6 + 16选1" },
  kl8: { code: "K8", name: "快乐8", rule: "80选20 · 选1至选10" },
  pl5: { code: "PL5", name: "排列5", rule: "五位直选" },
  pl3: { code: "PL3", name: "排列3", rule: "三位直选" },
};

function treeTicketText(gameKey, ticket) {
  const positional = gameKey === "pl3" || gameKey === "pl5";
  const main = ticket.main
    .map((number) => String(number).padStart(positional ? 1 : 2, "0"))
    .join(" ");
  const bonus = (ticket.bonus || [])
    .map((number) => String(number).padStart(2, "0"))
    .join(" ");
  return `${main}${bonus ? ` + ${bonus}` : ""}`;
}

function populateGameTree(analysis, multi) {
  const order = ["dlt", "ssq", "kl8", "pl5", "pl3"];
  $("#tree-game-grid").innerHTML = order
    .map((gameKey) => {
      const meta = GAME_TREE_META[gameKey];
      const game = multi.games[gameKey];
      if (!game || game.error) {
        return `
          <article class="game-tree-card">
            <div class="game-node-head">
              <div><span>${meta.code}</span><h2>${meta.name}</h2><small>${meta.rule}</small></div>
              <b class="game-node-code">!</b>
            </div>
            <div class="game-subtree">
              <div class="game-subnode"><span>数据状态</span><strong>${escapeHtml(game?.error || "暂无数据")}</strong></div>
            </div>
          </article>`;
      }
      const next = game.next;
      const ticketOption = next.ticket_options?.["3"];
      const tickets =
        gameKey === "dlt"
          ? analysis.recommendations.slice(0, 3).map((ticket) => ({
              main: ticket.front,
              bonus: ticket.back,
            }))
          : ticketOption?.tickets || [];
      const ticketCount = gameKey === "dlt" ? tickets.length : ticketOption?.count || tickets.length;
      const amount = gameKey === "dlt" ? ticketCount * 2 : ticketOption?.cost || ticketCount * 2;
      const model =
        gameKey === "dlt"
          ? {
              name: analysis.selection.passes_gate ? analysis.selection.model : "均匀校准基线",
              validation_gain_bps: analysis.selection.development_gain_bps,
              label: analysis.selection.passes_gate ? "通过门槛" : "未通过，回落基线",
            }
          : {
              name: game.models?.[0]?.name || "待分析",
              validation_gain_bps: game.models?.[0]?.validation_gain_bps || 0,
              label: "验证排序首位",
            };
      const regimeNode =
        gameKey === "dlt" && analysis.regime
          ? `
            <button class="game-subnode neutral" type="button" data-tree-game="dlt" data-tree-action="pattern">
              <span>5P · 10+5 规律</span>
              <strong>${escapeHtml(analysis.regime.live.direction_name)}方向 · ${analysis.regime.selected.passes_gate ? "通过复核" : "未通过"}</strong>
            </button>`
          : "";
      return `
        <article class="game-tree-card ${gameKey === "dlt" ? "is-primary" : ""}" data-game-tree="${gameKey}">
          <button class="game-node-head" type="button" data-tree-game="${gameKey}" data-tree-action="detail" aria-label="进入${meta.name}详情">
            <div>
              <span>${meta.code}</span>
              <h2>${meta.name}</h2>
              <small>${meta.rule}</small>
            </div>
            <b class="game-node-code">${gameKey === "dlt" ? "主" : String(order.indexOf(gameKey) + 1).padStart(2, "0")}</b>
          </button>
          <div class="game-subtree">
            <button class="game-subnode" type="button" data-tree-game="${gameKey}" data-tree-action="data">
              <span>DATA · 数据</span>
              <strong>${formatInteger(game.history.draw_count)}期 · ${game.history.latest_issue} → ${next.issue}</strong>
            </button>
            <button class="game-subnode ${gameKey === "dlt" ? "" : "neutral"}" type="button" data-tree-game="${gameKey}" data-tree-action="model">
              <span>MODEL · 模型</span>
              <strong>${escapeHtml(model.name)} · ${formatBps(model.validation_gain_bps)}</strong>
            </button>
            <button class="game-subnode neutral" type="button" data-tree-game="${gameKey}" data-tree-action="rule">
              <span>RULE · 下一期规则</span>
              <strong>${ticketCount}注 / ${amount}元 · ${escapeHtml(model.label)}</strong>
            </button>
            ${regimeNode}
          </div>
          <details class="game-more" ${gameKey === "dlt" ? "open" : ""}>
            <summary>展开下一期规则号码</summary>
            <div class="game-rule-list">
              ${tickets
                .map(
                  (ticket, index) =>
                    `<code>${String(index + 1).padStart(2, "0")} · ${treeTicketText(gameKey, ticket)}</code>`
                )
                .join("")}
            </div>
            <p>规则生成，非预测。</p>
          </details>
          <button class="branch-link tree-game-link" type="button" data-tree-game="${gameKey}" data-tree-action="detail">进入 ${meta.name} 详情 →</button>
        </article>`;
    })
    .join("");
}

function toggleEvidence() {
  const details = $("#verdict-evidence");
  const button = $("#verdict-toggle");
  details.open = !details.open;
  button.setAttribute("aria-expanded", String(details.open));
  if (details.open) {
    details.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function betStructureOptions(game) {
  if (game === "ssq") {
    return [
      ["auto", "自动选择预算内结构"],
      ["compound", "复式"],
      ["dantuo", "胆拖"],
      ["low_overlap", "低重叠独立单式"],
      ["single", "单式"],
    ];
  }
  if (game === "dlt") {
    return [
      ["auto", "自动选择预算内结构"],
      ["compound", "复式"],
      ["dantuo", "胆拖"],
      ["low_overlap", "低重叠独立单式"],
      ["single", "单式"],
    ];
  }
  if (game === "kl8") {
    return [
      ["auto", "按玩法自动计算"],
      ["compound", "复式"],
    ];
  }
  return [
    ["auto", "逐位直选"],
    ["single", "单式"],
  ];
}

function syncBetFields() {
  const game = $("#bet-game").value;
  const playField = $("#kl8-play-field");
  const mainField = $("[data-main-field]");
  const bonusField = $("[data-bonus-field]");
  const dantuoFields = $$("[data-dantuo-field]");
  const structureSelect = $("#bet-structure");
  const priorStructure = structureSelect.value;
  structureSelect.innerHTML = betStructureOptions(game)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  const allowed = [...structureSelect.options].map((option) => option.value);
  structureSelect.value = allowed.includes(priorStructure)
    ? priorStructure
    : "auto";
  const structure = structureSelect.value;
  playField.hidden = game !== "kl8";
  mainField.hidden = ["auto", "low_overlap", "single"].includes(structure);
  bonusField.hidden =
    ["auto", "low_overlap", "single"].includes(structure) ||
    !["ssq", "dlt"].includes(game);
  dantuoFields.forEach((field) => {
    field.hidden = structure !== "dantuo";
  });

  if (game === "ssq") {
    setText("#main-count-label", "红球复式个数");
    setText("#bonus-count-label", "蓝球复式个数");
    $("#bet-main-count").min = "6";
    $("#bet-main-count").max = "33";
    $("#bet-main-count").value = "8";
    $("#bet-bonus-count").min = "1";
    $("#bet-bonus-count").max = "16";
    $("#bet-bonus-count").value = "3";
    $("#bet-leaders").max = "5";
    $("#bet-draggers").max = "32";
  } else if (game === "dlt") {
    setText("#main-count-label", "前区复式个数");
    setText("#bonus-count-label", "后区复式个数");
    $("#bet-main-count").min = "5";
    $("#bet-main-count").max = "35";
    $("#bet-main-count").value = "6";
    $("#bet-bonus-count").min = "2";
    $("#bet-bonus-count").max = "12";
    $("#bet-bonus-count").value = "3";
    $("#bet-leaders").max = "4";
    $("#bet-draggers").max = "34";
  } else if (game === "kl8") {
    setText("#main-count-label", "复式选择号码个数");
    $("#bet-main-count").min = $("#bet-play").value;
    $("#bet-main-count").max = "80";
    $("#bet-main-count").value = $("#bet-play").value;
  }
  $("#bet-error").textContent = "";
}

function betPayload() {
  const game = $("#bet-game").value;
  const structure = $("#bet-structure").value;
  const includesPool = ["compound", "dantuo"].includes(structure);
  return {
    game,
    structure,
    budget: Number($("#bet-budget").value),
    max_tickets: Number($("#bet-max-tickets").value),
    seed: Number($("#bet-seed").value),
    main_count: includesPool ? Number($("#bet-main-count").value) : null,
    bonus_count:
      includesPool && ["ssq", "dlt"].includes(game)
        ? Number($("#bet-bonus-count").value)
        : null,
    leaders: structure === "dantuo" ? Number($("#bet-leaders").value) : 0,
    draggers: structure === "dantuo" ? Number($("#bet-draggers").value) : 0,
    play: game === "kl8" ? Number($("#bet-play").value) : 10,
  };
}

function renderBetMetrics(result) {
  setText("#bet-ticket-count", `${formatInteger(result.tickets)} 注`);
  setText("#bet-amount", `¥${formatInteger(result.amount)}`);
  setText("#bet-coverage", formatCoverage(result.coverage));
  if (result.game === "kl8") {
    setText(
      "#bet-probability",
      `全部命中 ${formatOneIn(result.exact_all_match_probability)}`
    );
  } else {
    setText(
      "#bet-probability",
      `单注 ${formatOneIn(1 / Number(result.total_combinations))}`
    );
  }
  setText(
    "#bet-note",
    `${result.label}。${result.probability_note} 覆盖率 ${formatCoverage(result.coverage)}，票包 ${formatInteger(result.tickets)} 注。`
  );
  const payoutPanel = $("#payout-panel");
  payoutPanel.hidden = result.game !== "kl8";
  if (result.game === "kl8") {
    setText("#payout-status", result.prize_status);
    const rows = result.prize_table || [];
    $("#payout-body").innerHTML = rows.length
      ? rows
          .map(
            (row) => `<tr>
              <td>中 ${formatInteger(row.match)} 个</td>
              <td class="numeric">${row.amount == null ? "待填" : formatMoney(row.amount)}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="2">当前本地开奖缓存没有选${formatInteger(result.play)}奖金结构：待填</td></tr>`;
  }
}

function seededRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function chooseCombination(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) return 0;
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result = (result * (n - k + index)) / index;
  }
  return Math.round(result);
}

function clientSample(pool, amount, rng) {
  const values = pool.slice();
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values.slice(0, amount).sort((left, right) => left - right);
}

const CLIENT_GAME_META = {
  dlt: { main: 35, draw: 5, bonus: 12, bonusDraw: 2 },
  ssq: { main: 33, draw: 6, bonus: 16, bonusDraw: 1 },
  kl8: { main: 80, draw: 20, bonus: 0, bonusDraw: 0 },
  pl3: { main: 10, draw: 3, bonus: 0, bonusDraw: 0 },
  pl5: { main: 10, draw: 5, bonus: 0, bonusDraw: 0 },
};

const CLIENT_KL8_PRIZES = {
  1: { 1: 4.5 },
  2: { 2: 19 },
  3: { 3: 52, 2: 3 },
  4: { 4: 93, 3: 5, 2: 3 },
  5: { 5: 1000, 4: 20, 3: 3 },
  6: { 6: 2880, 5: 30, 4: 10, 3: 3 },
  7: { 7: 8500, 6: 300, 5: 30, 4: 4, 0: 2 },
  8: { 8: 50000, 7: 800, 6: 80, 5: 10, 4: 3, 0: 2 },
  9: { 9: 250000, 8: 2000, 7: 225, 6: 22, 5: 5, 4: 3, 0: 2 },
  10: { 10: 5000000, 9: 8000, 8: 720, 7: 80, 6: 5, 5: 3, 0: 2 },
};

function clientTotalCombinations(game, play) {
  if (game === "dlt") return chooseCombination(35, 5) * chooseCombination(12, 2);
  if (game === "ssq") return chooseCombination(33, 6) * 16;
  if (game === "kl8") return chooseCombination(80, play);
  if (game === "pl3") return 1000;
  if (game === "pl5") return 100000;
  return 0;
}

function clientStructureTickets(payload) {
  const { game, structure, main_count, bonus_count, leaders, draggers, play } = payload;
  if (["single", "low_overlap"].includes(structure)) return 1;
  if (game === "ssq" && structure === "compound") {
    return chooseCombination(main_count, 6) * bonus_count;
  }
  if (game === "ssq" && structure === "dantuo") {
    return chooseCombination(draggers, 6 - leaders) * bonus_count;
  }
  if (game === "dlt" && structure === "compound") {
    return chooseCombination(main_count, 5) * chooseCombination(bonus_count, 2);
  }
  if (game === "dlt" && structure === "dantuo") {
    return chooseCombination(draggers, 5 - leaders) * chooseCombination(bonus_count, 2);
  }
  if (game === "kl8" && structure === "compound") {
    return chooseCombination(main_count, play);
  }
  throw new Error("当前彩种不支持该结构");
}

function clientCandidate(payload) {
  const meta = CLIENT_GAME_META[payload.game];
  const tickets = clientStructureTickets(payload);
  if (!Number.isFinite(tickets) || tickets < 1) throw new Error("号码结构没有形成有效注数");
  const total = clientTotalCombinations(payload.game, payload.play);
  return {
    ...payload,
    tickets,
    amount: tickets * 2,
    coverage: tickets / total,
    coverage_per_yuan: tickets / (tickets * 2),
    total_combinations: total,
  };
}

function clientCalculate(rawPayload) {
  const meta = CLIENT_GAME_META[rawPayload.game];
  let payload = { ...rawPayload };
  if (payload.structure === "auto") {
    if (["dlt", "ssq"].includes(payload.game)) {
      let best = null;
      const mainStart = payload.game === "ssq" ? 6 : 5;
      const bonusStart = payload.game === "ssq" ? 1 : 2;
      for (let main = mainStart; main <= meta.main; main += 1) {
        for (let bonus = bonusStart; bonus <= meta.bonus; bonus += 1) {
          const candidate = clientCandidate({
            ...payload,
            structure: "compound",
            main_count: main,
            bonus_count: bonus,
          });
          if (
            candidate.amount <= payload.budget &&
            candidate.tickets <= payload.max_tickets &&
            (!best || candidate.coverage > best.coverage ||
              (candidate.coverage === best.coverage && candidate.tickets > best.tickets))
          ) {
            best = candidate;
          }
        }
      }
      if (!best) throw new Error("当前预算和注数上限下没有可行的复式结构");
      return best;
    }
    payload.structure = payload.game === "kl8" ? "compound" : "single";
    payload.main_count = payload.game === "kl8" ? payload.play : meta.draw;
    payload.bonus_count = meta.bonusDraw;
  }
  if (payload.structure === "low_overlap") {
    payload.main_count = meta.draw;
    payload.bonus_count = meta.bonusDraw;
    payload.structure = "low_overlap";
    const candidate = clientCandidate({ ...payload, structure: "single" });
    const tickets = Math.min(payload.max_tickets, Math.floor(payload.budget / 2));
    return {
      ...candidate,
      structure: "low_overlap",
      tickets,
      amount: tickets * 2,
      coverage: tickets / candidate.total_combinations,
    };
  }
  if (payload.structure === "single") {
    payload.main_count = meta.draw;
    payload.bonus_count = meta.bonusDraw;
  }
  const candidate = clientCandidate(payload);
  if (candidate.amount > payload.budget) throw new Error("所选结构超过预算");
  if (candidate.tickets > payload.max_tickets) throw new Error("所选结构超过注数上限");
  return candidate;
}

function clientExpandedTickets(game, structure, mainPool, bonusPool, leaders, play) {
  const meta = CLIENT_GAME_META[game];
  const collect = (values, amount, start = 0, prefix = [], output = []) => {
    if (prefix.length === amount) {
      output.push(prefix.slice());
      return output;
    }
    for (let index = start; index <= values.length - (amount - prefix.length); index += 1) {
      collect(values, amount, index + 1, [...prefix, values[index]], output);
    }
    return output;
  };
  if (game === "kl8") {
    return collect(mainPool, play).map((main) => ({ main, bonus: [] }));
  }
  if (!["dlt", "ssq"].includes(game)) {
    return [{ main: mainPool, bonus: [] }];
  }
  let mainLines = [];
  if (structure === "compound") {
    mainLines = collect(mainPool, meta.draw);
  } else if (structure === "dantuo") {
    const fixed = mainPool.slice(0, leaders);
    mainLines = collect(mainPool.slice(leaders), meta.draw - leaders).map((drag) =>
      [...fixed, ...drag].sort((a, b) => a - b)
    );
  } else {
    mainLines = [mainPool.slice(0, meta.draw).sort((a, b) => a - b)];
  }
  const bonusLines = collect(bonusPool, meta.bonusDraw);
  return mainLines.flatMap((main) =>
    bonusLines.map((bonus) => ({ main, bonus: bonus.slice().sort((a, b) => a - b) }))
  );
}

function clientLowOverlap(game, count, rng) {
  const meta = CLIENT_GAME_META[game];
  const tickets = [];
  for (let attempt = 0; attempt < Math.max(10000, count * 2000) && tickets.length < count; attempt += 1) {
    const main = clientSample(
      Array.from({ length: meta.main }, (_, index) => index + 1),
      meta.draw,
      rng
    );
    const bonus = clientSample(
      Array.from({ length: meta.bonus }, (_, index) => index + 1),
      meta.bonusDraw,
      rng
    );
    if (
      tickets.some(
        (ticket) =>
          main.filter((number) => ticket.main.includes(number)).length > 1 ||
          bonus.filter((number) => ticket.bonus.includes(number)).length > 1
      )
    ) {
      continue;
    }
    tickets.push({ main, bonus });
  }
  if (tickets.length !== count) throw new Error("当前注数无法满足低重叠限制");
  return tickets;
}

function clientGeneratePackage(rawPayload) {
  const calculation = clientCalculate(rawPayload);
  if (calculation.tickets > 5000) throw new Error("展开结果超过5000注，请降低号码池或注数");
  const game = calculation.game;
  const meta = CLIENT_GAME_META[game];
  const rng = seededRandom(calculation.seed);
  const play = calculation.play || 10;
  let ticketLines = [];
  if (calculation.structure === "low_overlap" && ["dlt", "ssq"].includes(game)) {
    ticketLines = clientLowOverlap(game, calculation.tickets, rng);
  } else if (game === "kl8") {
    const pool = clientSample(Array.from({ length: 80 }, (_, index) => index + 1), calculation.main_count, rng);
    ticketLines = clientExpandedTickets("kl8", "compound", pool, [], 0, play);
  } else if (["dlt", "ssq"].includes(game)) {
    const pool = clientSample(Array.from({ length: meta.main }, (_, index) => index + 1), calculation.main_count, rng);
    const bonus = clientSample(Array.from({ length: meta.bonus }, (_, index) => index + 1), calculation.bonus_count, rng);
    ticketLines = clientExpandedTickets(game, calculation.structure, pool, bonus, calculation.leaders, play);
  } else {
    ticketLines = [{
      main: Array.from({ length: meta.draw }, () => Math.floor(rng() * 10)),
      bonus: [],
    }];
  }
  return {
    ...calculation,
    play: game === "kl8" ? play : null,
    prize_table: game === "kl8"
      ? Object.entries(CLIENT_KL8_PRIZES[play] || {}).map(([match, amount]) => ({ match: Number(match), amount }))
      : [],
    prize_status: game === "kl8" ? "固定估算表" : "不适用",
    exact_all_match_probability: game === "kl8" ? chooseCombination(20, play) / chooseCombination(80, play) : null,
    ticket_lines: ticketLines,
    label: "规则生成，非预测",
    probability_note: "覆盖率只表示票包覆盖的完整组合，不改变任一单注的理论概率。",
    structure_limit: "独立单式低重叠仅在可满足时执行；复式与胆拖天然共享号码。",
    warning: "本票包由固定预算、固定种子与规则生成；历史数据只用于展示，不参与选号。",
  };
}

async function requestBet(kind) {
  const errorNode = $("#bet-error");
  errorNode.textContent = "";
  const button = kind === "package" ? $("#bet-generate") : $("#bet-calculate");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "计算中…";
  try {
    let result;
    if (RUNTIME.staticMode) {
      result = kind === "package"
        ? clientGeneratePackage(betPayload())
        : clientCalculate(betPayload());
    } else {
      const response = await fetch(`./api/betting/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(betPayload()),
      });
      result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "计算失败");
      }
    }
    renderBetMetrics(result);
    if (kind === "package") {
      state.betPackage = result;
      renderPackage(result);
    } else {
      state.betPackage = null;
      $("#copy-package").disabled = true;
      setText("#package-meta", "尚未生成票包");
      $("#package-lines").innerHTML = "";
    }
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function ticketText(ticket) {
  return `${ticket.main.map((number) => String(number).padStart(2, "0")).join(" ")}${
    ticket.bonus.length
      ? ` + ${ticket.bonus.map((number) => String(number).padStart(2, "0")).join(" ")}`
      : ""
  }`;
}

function renderPackage(result) {
  setText(
    "#package-meta",
    `${result.label} · ${formatInteger(result.tickets)} 注 · ¥${formatInteger(result.amount)} · 覆盖率 ${formatCoverage(result.coverage)} · 种子 ${result.seed}`
  );
  $("#package-lines").innerHTML = result.ticket_lines
    .map(
      (ticket, index) => `
        <div class="package-line">
          <span>${String(index + 1).padStart(3, "0")}</span>
          <span>${escapeHtml(ticketText(ticket))}</span>
        </div>`
    )
    .join("");
  setText(
    "#package-note",
    `${result.warning} ${result.structure_limit} ${result.label}。`
  );
  $("#copy-package").disabled = false;
}

function renderRecentFive(result) {
  setText("#recent-main-head", result.main_label);
  setText("#recent-bonus-head", result.bonus_label || "无");
  const rowBalls = (values) =>
    `<div class="recent-number-line">${values
      .map((number) => `<span>${String(number).padStart(2, "0")}</span>`)
      .join("")}</div>`;
  $("#recent-five-body").innerHTML = result.rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.issue)}</td>
          <td>${escapeHtml(row.date)}</td>
          <td>${rowBalls(row.main)}</td>
          <td>${row.bonus.length ? rowBalls(row.bonus) : "—"}</td>
          <td class="numeric">${formatInteger(row.sum)}</td>
          <td class="numeric">${escapeHtml(row.odd_even)}</td>
          <td class="numeric">${escapeHtml(row.zone_ratio)}</td>
          <td class="numeric">${row.repeat_previous ?? "—"}</td>
          <td class="numeric">${row.same_as_20_back ?? "—"}</td>
        </tr>`
    )
    .join("");
}

async function loadRecentFive(game = state.recentFiveGame) {
  state.recentFiveGame = game;
  $("#recent-five-body").innerHTML =
    '<tr><td colspan="9">正在读取本地事实数据…</td></tr>';
  try {
    let result;
    if (RUNTIME.staticMode) {
      if (!state.recentFiveCache) {
        const response = await fetchWithRetry("./recent-five.json");
        state.recentFiveCache = await response.json();
      }
      result = state.recentFiveCache.games?.[game];
      if (!result) throw new Error("静态近五期文件缺少该彩种");
    } else {
      const response = await fetch(
        `./api/last-five?game=${encodeURIComponent(game)}`,
        { cache: "no-store" }
      );
      result = await response.json();
      if (!response.ok) throw new Error(result.message || "读取失败");
    }
    renderRecentFive(result);
  } catch (error) {
    $("#recent-five-body").innerHTML = `<tr><td colspan="9">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadScreeningReport() {
  if (state.screeningReport) return state.screeningReport;
  const response = await fetchWithRetry("./screening.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const report = await response.json();
  state.screeningReport = report;
  setText("#screening-status", "滚动审计完成");
  setText(
    "#screening-retention",
    formatRate(report.backtest.all_filters_retention)
  );
  setText("#screening-coverage", formatRate(report.space.coverage));
  setText(
    "#screening-space",
    `${formatInteger(report.space.accepted_front_combinations)} / ${formatInteger(report.space.front_combinations)}`
  );
  const ruleNames = Object.keys(report.backtest.rule_retention);
  setText("#screening-rule-count", `${ruleNames.length} 项`);
  setText(
    "#screening-rules",
    `${report.backtest.start_issue}—${report.backtest.end_issue}，${formatInteger(report.backtest.draws)}期事实复核。` +
      `筛选条件：${ruleNames.join("、")}。${report.warning}`
  );
  return report;
}

async function generateScreeningPackage() {
  const button = $("#screening-generate");
  const errorNode = $("#screening-error");
  const excluded = $("#screening-excluded")
    .value.split(/[\s,，]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number);
  if (excluded.some((number) => !Number.isInteger(number) || number < 1 || number > 35)) {
    errorNode.textContent = "排除号码必须是1至35之间的整数";
    return;
  }
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "筛选中…";
  errorNode.textContent = "";
  try {
    const response = await fetchWithRetry("./api/screening/package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        excluded_numbers: excluded,
        count: Number($("#screening-count").value),
        seed: Number($("#screening-seed").value),
      }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || "生成失败");
    $("#screening-result").innerHTML = result.tickets
      .map(
        (ticket, index) => `
          <div class="screening-ticket">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <span>${ticket.main.map((number) => String(number).padStart(2, "0")).join(" ")} + ${ticket.bonus.map((number) => String(number).padStart(2, "0")).join(" ")}</span>
            <span>¥2</span>
          </div>`
      )
      .join("");
    setText(
      "#screening-status",
      `${result.count}注 / ${result.amount}元 / 种子 ${result.seed}`
    );
    setText(
      "#screening-rules",
      `${result.warning} 票包覆盖率为${formatRate(result.coverage)}。${result.label}。`
    );
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function populateHeader(data) {
  const source = data.source;
  const selection = data.selection;
  const metrics = data.metrics;
  const validation = data.validation;

  setText("#next-issue", source.next_issue);
  setText("#next-date", formatDate(source.next_date));
  $("#last-balls").innerHTML = balls(source.latest_front, source.latest_back, true);
  setText("#selection-stamp", selection.passes_gate ? "SIGNAL PASSED" : "NO ROBUST EDGE");

  $("#hero-meta").innerHTML = [
    `覆盖 ${source.start_issue}—${source.latest_issue}`,
    `留出复核 ${validation.holdout_draws} 期`,
    `候选池 ${validation.candidate_count} 组`,
  ]
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");

  setText("#stat-draws", numberFormatter.format(source.draw_count));
  setText("#stat-range", `${formatDate(source.start_date)} — ${formatDate(source.latest_date)}`);
  setText("#stat-candidates", numberFormatter.format(validation.candidate_count));
  setText("#stat-holdout", validation.holdout_draws);
  setText(
    "#stat-holdout-range",
    `${validation.holdout_start_issue} — ${validation.holdout_end_issue}`
  );
  setText("#stat-verdict", selection.passes_gate ? "挑战成功" : "基线胜出");
  setText("#stat-gain", `留出集 ${formatBps(metrics.selected.holdout_gain_bps)}`);
}

function populateOverview(data) {
  const selection = data.selection;
  const metrics = data.metrics;
  const status = $("#gate-status");
  status.textContent = selection.passes_gate ? "通过门槛" : "未通过门槛";
  status.classList.toggle("success", selection.passes_gate);
  setText("#selected-model", selection.model);
  setText("#selected-description", selection.model_description);
  setText("#selection-reason", selection.reason);
  setText(
    "#ci-label",
    `${formatBps(selection.development_ci_low_bps)} 至 ${formatBps(selection.development_ci_high_bps)}`
  );

  const low = Number(selection.development_ci_low_bps);
  const high = Number(selection.development_ci_high_bps);
  const center = Number(selection.development_gain_bps);
  const bound = Math.max(0.5, Math.abs(low), Math.abs(high)) * 1.18;
  const toPosition = (value) => Math.max(2, Math.min(98, 50 + (value / bound) * 50));
  const bandLeft = toPosition(low);
  const bandRight = toPosition(high);
  $("#interval-band").style.left = `${bandLeft}%`;
  $("#interval-band").style.width = `${Math.max(1, bandRight - bandLeft)}%`;
  $("#interval-dot").style.left = `${toPosition(center)}%`;

  $("#recommendations").innerHTML = data.recommendations
    .map(
      (ticket, index) => `
        <div class="recommendation-ticket" title="${escapeHtml(ticket.note)}">
          <div class="ticket-name">
            <strong>${escapeHtml(ticket.label)}</strong>
            <span>SET ${String(index + 1).padStart(2, "0")}</span>
          </div>
          <div class="ticket-balls" aria-label="${escapeHtml(ticket.label)}号码">
            ${ticket.front.map((number) => `<span class="ball small">${String(number).padStart(2, "0")}</span>`).join("")}
            <span class="ticket-divider" aria-hidden="true"></span>
            ${ticket.back.map((number) => `<span class="ball back small">${String(number).padStart(2, "0")}</span>`).join("")}
          </div>
        </div>`
    )
    .join("");

  renderCompactGrid("overview-front-grid", data.number_stats.front, "count_100");
  renderCompactGrid("overview-back-grid", data.number_stats.back, "count_100");
}

function populateForecast(data) {
  const forecast = data.forecast;
  if (!forecast) return;
  setText(
    "#forecast-target",
    `${forecast.target_issue} · ${formatDate(forecast.target_date)}`
  );
  $("#forecast-table-body").innerHTML = forecast.strategies
    .map((row) => {
      const ticket = row.next_ticket;
      return `
        <tr>
          <td><span class="rank-badge">${row.rank}</span></td>
          <td class="forecast-name">${escapeHtml(row.name)}</td>
          <td>
            <div class="forecast-ticket">
              ${ticket.front.map((number) => `<span class="ball">${String(number).padStart(2, "0")}</span>`).join("")}
              ${ticket.back.map((number) => `<span class="ball back">${String(number).padStart(2, "0")}</span>`).join("")}
            </div>
          </td>
          <td class="numeric">${formatBrier(row.brier)}</td>
          <td class="numeric ${row.gain_bps >= 0 ? "positive" : "negative"}">${formatBps(row.gain_bps)}</td>
          <td class="numeric">${Number(row.front_top_hits).toFixed(3)} / 5</td>
          <td class="numeric">${row.prize_hits} / ${forecast.holdout_draws}</td>
        </tr>`;
    })
    .join("");
}

function populateShortterm(data) {
  const shortterm = data.shortterm;
  if (!shortterm) return;
  setText(
    "#shortterm-target",
    `最新已开奖 ${shortterm.latest_draw.issue} · 下一期 ${shortterm.next.issue}（${formatDate(shortterm.next.date)}）`
  );
  setText("#shortterm-policy-pill", `当前：${shortterm.next.selected_policy_name}`);
  $("#shortterm-latest-balls").innerHTML = balls(
    shortterm.latest_draw.front,
    shortterm.latest_draw.back,
    true
  );
  setText("#shortterm-attribution", shortterm.postmortem.attribution);
  setText("#shortterm-next-policy", shortterm.next.selected_policy_name);
  setText("#shortterm-next-logic", shortterm.next.logic);
  $("#shortterm-next-balls").innerHTML = balls(
    shortterm.next.front,
    shortterm.next.back,
    true
  );
  const meta = shortterm.backtest.strategies.find((row) => row.key === "meta20");
  setText(
    "#shortterm-meta-prize",
    meta ? `${meta.prize_hits} / ${shortterm.backtest.holdout_draws}` : "—"
  );
  setText(
    "#shortterm-pack-rate",
    formatRate(shortterm.backtest.five_ticket_pack_prize_rate)
  );
  setText("#shortterm-update-state", `已到 ${shortterm.latest_draw.issue}`);

  const logic = {
    hot5: "最近五期热号延续",
    cold5: "最近五期冷号回补",
    hot10: "最近十期热号延续",
    repeat: "直接跟随上期重号",
    meta20: "按过去20期命中评分切换",
  };
  $("#shortterm-table-body").innerHTML = shortterm.backtest.strategies
    .map(
      (row) => `
        <tr>
          <td class="forecast-name">${escapeHtml(row.name)}</td>
          <td class="rule-summary">${escapeHtml(logic[row.key] || row.source)}</td>
          <td class="numeric">${Number(row.front_hits).toFixed(3)} / 5</td>
          <td class="numeric">${Number(row.back_hits).toFixed(3)} / 2</td>
          <td class="numeric">${row.prize_hits} / ${shortterm.backtest.holdout_draws}</td>
        </tr>`
    )
    .join("");
}

function populateRegime(data) {
  const regime = data.regime;
  if (!regime) return;
  const selected = regime.selected;
  const live = regime.live;
  const comparison = regime.holdout_comparison;
  const status = $("#regime-status");
  status.textContent = selected.passes_gate ? "通过门槛" : "未通过，保持中性";
  status.classList.toggle("success", selected.passes_gate);
  status.classList.toggle("fail", !selected.passes_gate);

  setText(
    "#regime-current",
    `${live.direction_name} · β ${Number(selected.beta).toFixed(2)}`
  );
  setText("#regime-validation", formatBps(selected.validation_gain_bps));
  setText(
    "#regime-ci",
    `95% CI ${formatBps(selected.validation_ci_low_bps)} 至 ${formatBps(selected.validation_ci_high_bps)}`
  );
  setText("#regime-holdout", formatBps(selected.holdout_gain_bps));
  setText("#regime-switches", `${selected.holdout_switch_count} 次`);
  setText(
    "#regime-block-count",
    `${selected.holdout_block_count} 个五期块`
  );
  setText("#regime-verdict", regime.verdict);
  setText(
    "#regime-leakage-note",
    `${regime.leakage_guard} ${regime.label}。`
  );

  const chips = (rows) =>
    rows
      .map(
        (row) =>
          `<span class="regime-number-chip"><b>${String(row.number).padStart(2, "0")}</b>${Number(row.acceleration_bps) >= 0 ? "+" : ""}${Number(row.acceleration_bps).toFixed(1)} bp</span>`
      )
      .join("");
  $("#regime-accelerating").innerHTML = chips(live.front_acceleration_top);
  $("#regime-decelerating").innerHTML = chips(live.front_deceleration_top);

  $("#regime-block-body").innerHTML = regime.recent_blocks
    .slice()
    .reverse()
    .map((block) => {
      const good = Number(block.block_adaptive_gain_bps) >= 0;
      return `
        <tr>
          <td>${escapeHtml(block.start_issue)}—${escapeHtml(block.end_issue)}</td>
          <td>${escapeHtml(block.direction_name)}</td>
          <td class="numeric">${formatBps(block.pre_block_continuation_bps)}</td>
          <td class="numeric">${formatBps(block.pre_block_reversal_bps)}</td>
          <td class="numeric">${formatBps(block.block_adaptive_gain_bps)}</td>
          <td><span class="regime-outcome ${good ? "is-good" : "is-bad"}">${good ? "有效" : "失效"}</span></td>
        </tr>`;
    })
    .join("");

  setText(
    "#shortterm-policy-pill",
    `动态状态：${live.direction_name}`
  );
  setText(
    "#stat-gain",
    `主模型留出 ${formatBps(data.metrics.selected.holdout_gain_bps)} · 状态机 ${formatBps(comparison.adaptive_gain_bps)}`
  );
}

function populatePatterns(data) {
  const patterns = data.patterns;
  if (!patterns) return;
  setText("#pattern-verdict", patterns.verdict);
  $("#pattern-window-grid").innerHTML = patterns.windows
    .map(
      (row) => `
        <div title="近${row.window}期平均重号 ${Number(row.average_repeat_count).toFixed(2)}；后区连号率 ${formatRate(row.back_consecutive_draw_rate)}">
          <span>近 ${row.window} 期</span>
          <strong>${formatRate(row.consecutive_draw_rate)}</strong>
          <span>前区含连号</span>
        </div>`
    )
    .join("");
  const ticket = patterns.next_pattern_ticket;
  $("#pattern-ticket").innerHTML = balls(ticket.front, ticket.back, true);
}

function populateSchemeAudit(data) {
  const audit = data.scheme_audit;
  if (!audit) return;
  setText("#scheme-case-cost", formatMoney(audit.case.exact_cost));
  setText(
    "#scheme-case-copy",
    `${audit.case.explanation} 标准方案共 ${numberFormatter.format(audit.case.exact_ticket_count)} 注。`
  );
  $("#scheme-audit-body").innerHTML = audit.rows
    .map(
      (row) => `
        <tr class="${row.front_count === 15 && row.back_count === 5 ? "is-selected" : ""}">
          <td class="forecast-name">${escapeHtml(row.name)}</td>
          <td class="numeric">${numberFormatter.format(row.ticket_count)}</td>
          <td class="numeric">${formatMoney(row.cost)}</td>
          <td class="numeric">${formatPercent(row.jackpot_probability)}</td>
          <td class="numeric">${formatPercent(row.any_prize_probability)}</td>
          <td class="numeric negative">${formatMoney(row.expected_net)}</td>
        </tr>`
    )
    .join("");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderTicketResult(result) {
  if (!result.tickets?.length) {
    $("#ticket-result").innerHTML = '<p class="empty-state">没有识别到完整号码</p>';
    return;
  }
  $("#ticket-result").innerHTML = `
    ${result.ocr_text ? `<p class="text-small">OCR文本：${escapeHtml(result.ocr_text).replaceAll("\n", "<br>")}</p>` : ""}
    <div class="ticket-result-row"><strong>期号</strong><span>${escapeHtml(result.issue)}</span><span></span></div>
    ${result.tickets
      .map(
        (ticket) => `
          <div class="ticket-result-row">
            <span>${escapeHtml(ticket.line)}</span>
            <strong>${escapeHtml(ticket.best_label)}</strong>
            <span>${ticket.ticket_count}注 · ${formatMoney(ticket.cost)}${ticket.payout_estimate != null ? ` · 估算奖金 ${formatMoney(ticket.payout_estimate)}` : ""}</span>
          </div>`
      )
      .join("")}`;
}

async function submitTicketCheck(withImage) {
  const game = $("#ticket-game").value;
  const issue = $("#ticket-issue").value.trim();
  const text = $("#ticket-text").value;
  if (withImage && !state.ticketImageData) {
    showToast("请先选择票面图片");
    return;
  }
  const button = withImage ? $("#ticket-check-image") : $("#ticket-check-text");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = withImage ? "识别中…" : "验票中…";
  try {
    const response = await fetch("./api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game,
        issue,
        text,
        play: game === "kl8" ? Number($("#ticket-play").value) : 10,
        image: withImage ? state.ticketImageData : "",
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "验票失败");
    renderTicketResult(result);
  } catch (error) {
    $("#ticket-result").innerHTML = `<p class="ticket-result-row">${escapeHtml(error.message)}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function renderJackpotTable() {
  if (!state.analysis?.jackpot) return;
  const jackpot = state.analysis.jackpot;
  const rows = jackpot.rows.filter(
    (row) => Number(row.years) === Number(state.jackpotYears)
  );
  $("#jackpot-table-body").innerHTML = rows
    .map(
      (row) => `
        <tr class="${row.tickets_per_draw === 3 ? "is-selected" : ""}">
          <td>${row.tickets_per_draw} 注</td>
          <td class="numeric">${formatMoney(row.cost_per_draw)}</td>
          <td class="numeric">${formatMoney(row.total_cost)}</td>
          <td class="numeric">${formatSmallProbability(row.jackpot_probability)}</td>
          <td class="numeric">1 / ${numberFormatter.format(Math.round(row.one_in))}</td>
        </tr>`
    )
    .join("");
  $$(".jackpot-year").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.years === String(state.jackpotYears));
  });
}

function populateJackpot(data) {
  const jackpot = data.jackpot;
  if (!jackpot) return;
  setText(
    "#jackpot-target",
    `${jackpot.target_issue} · ${formatDate(jackpot.target_date)}，共 ${numberFormatter.format(jackpot.draw_combinations)} 种组合`
  );
  $("#jackpot-tickets").innerHTML = jackpot.recommended.tickets
    .map(
      (ticket, index) => `
        <div class="jackpot-ticket">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div class="recent-balls">${balls(ticket.front, ticket.back, true)}</div>
        </div>`
    )
    .join("");
  const yearly = jackpot.rows.find(
    (row) => row.tickets_per_draw === 3 && row.years === 1
  );
  setText("#jackpot-year-cost", formatMoney(yearly.total_cost));
  setText(
    "#jackpot-year-probability",
    `1 / ${numberFormatter.format(Math.round(yearly.one_in))}`
  );
  setText("#jackpot-warning", jackpot.warning);
  renderJackpotTable();
}

function renderMultiGame() {
  const data = state.multiData;
  if (!data) return;
  const game = data.games[state.selectedGame];
  if (!game) {
    setText("#multi-game-name", GAME_TREE_META[state.selectedGame]?.name || "彩种");
    setText("#multi-rules", "正在加载该彩种…");
    setText("#multi-history-copy", "数据按彩种拆分加载，其他彩种不会阻塞当前页面。");
    return;
  }
  $$(".game-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.game === state.selectedGame);
  });
  if (game.error) {
    setText("#multi-game-name", game.name);
    setText("#multi-rules", "数据不可用");
    setText("#multi-history-copy", game.error);
    return;
  }
  setText("#multi-game-name", game.name);
  setText(
    "#multi-rules",
    `${game.rules.main} · ${game.rules.bonus} · 单注 ${game.rules.ticket}`
  );
  const positional = state.selectedGame === "pl3" || state.selectedGame === "pl5";
  const gameBalls = (main, bonus = []) =>
    positional
      ? `${main.map((number) => `<span class="ball small">${number}</span>`).join("")}${bonus.map((number) => `<span class="ball back small">${number}</span>`).join("")}`
      : balls(main, bonus, true);
  setText("#multi-next-issue", game.next.issue);
  setText("#multi-next-date", formatDate(game.next.date));
  $("#multi-latest-balls").innerHTML = gameBalls(
    game.history.latest_main,
    game.history.latest_bonus
  );
  setText(
    "#multi-history-copy",
    `${game.history.start_date} — ${game.history.latest_date}，共 ${numberFormatter.format(game.history.draw_count)} 期；最新 ${game.history.latest_issue}`
  );
  setText("#multi-sum-mean", Number(game.stats.sum_mean).toFixed(1));
  setText("#multi-sum-range", `${game.stats.sum_min}—${game.stats.sum_max}`);
  setText("#multi-odd-mean", Number(game.stats.odd_mean).toFixed(2));
  setText(
    "#multi-hot-numbers",
    game.stats.hot_numbers.map((number) => String(number).padStart(2, "0")).join(" ")
  );
  setText(
    "#multi-cold-numbers",
    game.stats.cold_numbers
      .map(
        (number) =>
          `${String(number).padStart(2, "0")}·${game.stats.cold_omissions[String(number)]}期`
      )
      .join(" ")
  );
  const ticketOption = game.next.ticket_options[String(state.multiTicketCount)];
  $("#multi-primary-ticket").innerHTML = ticketOption.tickets
    .map(
      (ticket, index) => `
        <div class="multi-ticket-row">
          <small>${String(index + 1).padStart(2, "0")}</small>
          ${gameBalls(ticket.main, ticket.bonus)}
        </div>`
    )
    .join("");
  setText("#multi-ticket-cost", `${ticketOption.cost}元`);
  $$(".multi-ticket-count").forEach((button) => {
    button.classList.toggle(
      "is-active",
      Number(button.dataset.count) === state.multiTicketCount
    );
  });
  $("#multi-compound-ticket").innerHTML = gameBalls(
    game.next.compound,
    game.next.compound_bonus
  );
  if (positional) {
    $("#multi-compound-ticket").innerHTML = game.next.position_pools
      .map((pool, index) => `<span class="viz-badge">${index + 1}位 ${pool.join("/")}</span>`)
      .join("");
    $("#multi-big-pool").innerHTML = "";
    setText(
      "#multi-dantuo-copy",
      game.next.position_pools
        .map((pool, index) => `${index + 1}位：${pool.join(" / ")}`)
        .join("；")
    );
  } else {
    const pool = game.next.big_pool;
    const min = Math.min(...pool);
    const max = Math.max(...pool);
    $("#multi-big-pool").innerHTML = pool
      .map(
        (number) => `
          <span class="number-cell" style="--cell-bg:${valueColor(number, min, max, 0.58)}">
            ${String(number).padStart(2, "0")}
          </span>`
      )
      .join("");
    setText(
      "#multi-dantuo-copy",
      `3胆：${game.next.dantuo.leaders.map((n) => String(n).padStart(2, "0")).join(" ")}；5拖：${game.next.dantuo.draggers.map((n) => String(n).padStart(2, "0")).join(" ")}${game.next.bonus_pool?.length ? `；特区池：${game.next.bonus_pool.map((n) => String(n).padStart(2, "0")).join(" ")}` : ""}`
    );
  }
  $("#multi-previous-prediction").innerHTML = gameBalls(
    game.previous.predicted_main,
    game.previous.predicted_bonus
  );
  $("#multi-previous-actual").innerHTML = gameBalls(
    game.previous.actual_main,
    game.previous.actual_bonus
  );
  setText(
    "#multi-previous-result",
    game.previous.label
  );
  setText("#multi-previous-note", game.previous.note);

  const outcomeSummary = (outcome) => {
    if (!outcome) return "—";
    if (outcome.position_hits) {
      return {
        hit: `${outcome.position_hits.length}/${game.main_draw}位`,
        prize: outcome.tier ? "直选" : "",
      };
    }
    const main = (outcome.main_hits || []).length;
    if (game.key === "kl8") {
      return {
        hit: `${main}个`,
        prize: outcome.tier ? "快乐8奖级" : "",
      };
    }
    const bonus = (outcome.bonus_hits || []).length;
    return {
      hit: `${main}+${bonus}`,
      prize: outcome.tier ? `${outcome.tier}等奖` : "",
    };
  };
  const optionCell = (option) => {
    if (!option) return '<span class="snapshot-empty">—</span>';
    const outcomes =
      option.outcomes ||
      (Array.isArray(option.tickets) &&
      option.tickets.some((ticket) => ticket && "main_hits" in ticket || ticket && "position_hits" in ticket)
        ? option.tickets
        : []);
    if (!outcomes.length) return '<span class="snapshot-empty">—</span>';
    const summaries = outcomes.map(outcomeSummary);
    const bestHit = summaries
      .slice()
      .sort((left, right) => {
        const parse = (value) =>
          String(value)
            .split(/[+/个位]/)
            .filter(Boolean)
            .reduce((sum, part) => sum + Number(part || 0), 0);
        return parse(right.hit) - parse(left.hit);
      })[0];
    const prize = outcomes
      .map((outcome) => outcomeSummary(outcome).prize)
      .filter(Boolean)
      .sort((left, right) => {
        const number = (value) => Number(String(value).match(/\d+/)?.[0] || 99);
        return number(left) - number(right);
      })[0];
    const payout = Number(option.payout_estimate || 0);
    const net = Number(option.net_estimate || 0);
    return `
      <strong>${option.wins}注中奖</strong>
      <small>最高 ${escapeHtml(bestHit?.hit || "—")}${prize ? ` · ${escapeHtml(prize)}` : ""}</small>
      <small>估算奖金 ${formatMoney(payout)} · 净 ${formatMoney(net)}</small>`;
  };
  const historyRows = game.recommendation_history.slice(0, 12);
  $("#multi-history-body").innerHTML = historyRows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.issue)}<small>${escapeHtml(row.date)}</small></td>
          <td><div class="history-number-line">${row.actual_main.map((number) => `<span>${String(number).padStart(positional ? 1 : 2, "0")}</span>`).join("")}${row.actual_bonus.map((number) => `<span>${String(number).padStart(2, "0")}</span>`).join("")}</div></td>
          ${["1", "3", "5", "10"]
            .map((count) => `<td class="numeric snapshot-cell">${optionCell(row.ticket_options?.[count])}</td>`)
            .join("")}
        </tr>`
    )
    .join("");
  const optionStats = ["1", "3", "5", "10"].map((count) => {
    const options = historyRows
      .map((row) => row.ticket_options?.[count])
      .filter(Boolean);
    return {
      count: Number(count),
      cost: options.reduce((sum, option) => sum + Number(option.cost || 0), 0),
      wins: options.reduce((sum, option) => sum + Number(option.wins || 0), 0),
      winningPeriods: options.filter((option) => Number(option.wins || 0) > 0).length,
      payout: options.reduce(
        (sum, option) => sum + Number(option.payout_estimate || 0),
        0
      ),
      net: options.reduce(
        (sum, option) => sum + Number(option.net_estimate || 0),
        0
      ),
    };
  });
  $("#multi-history-summary").innerHTML = optionStats
    .map(
      (row) => `
        <span><b>${row.count}注</b><small>12期成本 ¥${row.cost} · 中奖${row.winningPeriods}期 · ${row.wins}注</small><small>每100元中奖期 ${row.cost ? ((row.winningPeriods / row.cost) * 100).toFixed(1) : "0.0"} · 估算奖金 ¥${formatInteger(row.payout)} · 净 ${formatMoney(row.net)}</small></span>`
    )
    .join("");
  const snapshots = (data.snapshots || []).filter(
    (snapshot) => snapshot.game === state.selectedGame
  );
  $("#multi-snapshot-body").innerHTML = snapshots.length
    ? snapshots
        .map((snapshot) => {
          const outcomes = snapshot.actual?.outcomes || {};
          return `
            <tr>
              <td>${escapeHtml(snapshot.issue)}</td>
              <td>${snapshot.status === "settled" ? "已复盘" : "待开奖"}<small>${escapeHtml(snapshot.record_kind === "live_frozen" ? "赛前冻结" : "旧版快照")}</small></td>
              ${["1", "3", "5", "10"]
                .map((count) => `<td class="numeric snapshot-cell">${optionCell(outcomes[count])}</td>`)
                .join("")}
            </tr>`;
        })
        .join("")
    : '<tr><td colspan="6">尚无持久化快照</td></tr>';
  $("#multi-model-body").innerHTML = game.models
    .map(
      (row) => `
        <tr class="${row.rank === 1 ? "is-selected" : ""}">
          <td><span class="rank-badge">${row.rank}</span></td>
          <td class="forecast-name">${escapeHtml(row.name)}</td>
          <td class="numeric">${formatBrier(row.validation_brier)}</td>
          <td class="numeric ${row.validation_gain_bps >= 0 ? "positive" : "negative"}">${formatBps(row.validation_gain_bps)}</td>
          <td class="numeric">${formatBrier(row.holdout_brier)}</td>
          <td class="numeric">${Number(row.front_top_hits).toFixed(3)} / ${positional ? "1位" : game.rules.main.split("选")[1]}</td>
          <td class="numeric">${row.bonus_top_hits == null ? "—" : `${Number(row.bonus_top_hits).toFixed(3)} / ${game.rules.bonus.split("选")[1]}`}</td>
        </tr>`
    )
    .join("");
  setText("#multi-note", data.note);
}

function createMultiEnvelope() {
  return {
    games: {},
    snapshots: [],
    note: "每个彩种独立训练、独立归一化；所有号码标注规则生成，非预测。",
    model_family: [],
  };
}

function mergeMultiPayload(payload) {
  if (!state.multiData) state.multiData = createMultiEnvelope();
  if (payload.games && typeof payload.games === "object") {
    Object.assign(state.multiData.games, payload.games);
  }
  if (payload.game && payload.game_key) {
    state.multiData.games[payload.game_key] = payload.game;
  }
  if (payload.note) state.multiData.note = payload.note;
  if (payload.model_family) state.multiData.model_family = payload.model_family;
  if (Array.isArray(payload.snapshots)) {
    const merged = new Map(
      state.multiData.snapshots.map((snapshot) => [
        `${snapshot.game}|${snapshot.issue}`,
        snapshot,
      ])
    );
    payload.snapshots.forEach((snapshot) => {
      merged.set(`${snapshot.game}|${snapshot.issue}`, snapshot);
    });
    state.multiData.snapshots = [...merged.values()];
  }
  return state.multiData;
}

function renderMultiGameSwitch() {
  const order = ["dlt", "ssq", "kl8", "pl5", "pl3"];
  $("#multi-game-switch").innerHTML = order
    .map(
      (key) => `
        <button class="game-button ${key === state.selectedGame ? "is-active" : ""}"
          type="button" data-game="${key}">${escapeHtml(GAME_TREE_META[key].name)}</button>`
    )
    .join("");
  $$(".game-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedGame = button.dataset.game;
      renderMultiGame();
      ensureMultiData(state.selectedGame).catch((error) => {
        console.error(error);
      });
      renderResearchAudit();
    });
  });
}

function populateMultilottery(data) {
  mergeMultiPayload(data);
  renderMultiGameSwitch();
  $$(".multi-ticket-count").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      state.multiTicketCount = Number(button.dataset.count);
      renderMultiGame();
    });
  });
  renderMultiGame();
  if (
    state.analysis &&
    Object.keys(state.multiData.games).length === Object.keys(GAME_TREE_META).length
  ) {
    populateGameTree(state.analysis, state.multiData);
  }
}

function researchLedger(game, scheme, count = 3) {
  return game?.ledgers?.[scheme]?.[String(count)] || null;
}

function renderResearchAudit() {
  const audit = state.researchAudit;
  if (!audit) return;
  const status = $("#research-audit-status");
  if (status) {
    status.textContent = "正式执行：中性基线";
    status.className = "status-pill";
  }
  setText("#research-audit-note", audit.verdict);
  const body = $("#research-audit-body");
  if (body) {
    body.innerHTML = ["dlt", "ssq", "kl8", "pl5", "pl3"]
      .map((key) => {
        const game = audit.games?.[key];
        const meta = GAME_TREE_META[key];
        if (!game || game.error) {
          return `<tr><td>${meta?.name || key}</td><td colspan="5">${escapeHtml(game?.error || "暂无数据")}</td></tr>`;
        }
        const rolling = researchLedger(game, "rolling");
        const anchor = researchLedger(game, "anchor");
        const random = researchLedger(game, "random");
        return `
          <tr>
            <td class="forecast-name">${escapeHtml(meta?.name || key)}</td>
            <td class="numeric">${formatInteger(game.draws)}</td>
            <td class="numeric ${game.brier.gain_bps >= 0 ? "positive" : "negative"}">${formatBps(game.brier.gain_bps)}</td>
            <td class="numeric">${formatBps(game.brier.ci_low_bps)} 至 ${formatBps(game.brier.ci_high_bps)}</td>
            <td class="numeric">${formatMoney(rolling?.net_estimate || 0)} / ${formatMoney(anchor?.net_estimate || 0)} / ${formatMoney(random?.net_estimate || 0)}</td>
            <td><span class="mini-status">${game.brier.passes_gate ? "通过研究门槛" : "未通过 · 均匀"}</span></td>
          </tr>`;
      })
      .join("");
  }
  const selected = audit.games?.[state.selectedGame];
  const ledgerBody = $("#research-ledger-body");
  if (ledgerBody && selected && !selected.error) {
    const labels = {
      rolling: ["每期滚动", "每期使用目标期前 10+5 信号"],
      anchor: ["固定守号", "起始期冻结一组号码，之后不再更改"],
      random: ["同预算随机", "相同注数、相同每期成本"],
    };
    ledgerBody.innerHTML = ["rolling", "anchor", "random"]
      .map((scheme) => {
        const row = researchLedger(selected, scheme);
        return `
          <tr class="${scheme === "random" ? "is-reference" : ""}">
            <td><strong>${labels[scheme][0]}</strong><small>${labels[scheme][1]}</small></td>
            <td class="numeric">${formatMoney(row?.cost || 0)}</td>
            <td class="numeric">${formatInteger(row?.winning_draws || 0)}</td>
            <td class="numeric">${formatInteger(row?.winning_tickets || 0)}</td>
            <td class="numeric">${formatMoney(row?.payout_estimate || 0)}</td>
            <td class="numeric ${(row?.net_estimate || 0) >= 0 ? "positive" : "negative"}">${formatMoney(row?.net_estimate || 0)}</td>
            <td class="numeric">${formatInteger(row?.max_losing_streak || 0)} 期</td>
          </tr>`;
      })
      .join("");
    setText(
      "#research-ledger-copy",
      `${selected.start_date} — ${selected.end_date}，共 ${formatInteger(selected.draws)} 期；同时保存近12/120/500期切片。${selected.leakage_guard}`
    );
    setText(
      "#research-ledger-note",
      `校准 ECE：均匀 ${Number(selected.calibration?.ece_uniform || 0).toFixed(4)}，研究候选 ${Number(selected.calibration?.ece_research || 0).toFixed(4)}。注册表 ${audit.model_registry?.version || "未登记"}；二等奖浮动金额不唯一可推时不计入现金估算。`
    );
    const recent = selected.recent12_observation || {};
    $("#research-recent12").innerHTML = ["rolling", "anchor", "random"]
      .map((scheme) => {
        const row = recent[scheme]?.["3"];
        return `<span><b>${labels[scheme][0]}</b><small>近12期成本 ${formatMoney(row?.cost || 0)} · 中奖 ${formatInteger(row?.winning_draws || 0)} 期 · 净 ${formatMoney(row?.net_estimate || 0)}</small><small>观察样本，不参与模型晋级</small></span>`;
      })
      .join("");
  } else if (ledgerBody) {
    ledgerBody.innerHTML =
      '<tr><td colspan="7">选择彩种后加载拆分的长期账本。</td></tr>';
  }
  $("#kl8-play-card").hidden = state.selectedGame !== "kl8";
  if (state.selectedGame === "kl8") {
    const comparison = audit.kl8_play_comparison;
    setText(
      "#kl8-best-play",
      `历史返奖首位：选${comparison.historical_best_return_play} · 主研究仍选十`
    );
    $("#kl8-play-body").innerHTML = Object.values(comparison.plays)
      .map((row) => `
        <tr class="${Number(row.play) === 10 ? "is-selected" : ""}">
          <td>选${row.play}</td>
          <td class="numeric">${formatRate(row.winning_rate)}</td>
          <td class="numeric">${Number(row.average_hits).toFixed(3)}</td>
          <td class="numeric">${formatMoney(row.cost)}</td>
          <td class="numeric">${formatMoney(row.payout_estimate)}</td>
          <td class="numeric ${row.net_estimate >= 0 ? "positive" : "negative"}">${formatMoney(row.net_estimate)}</td>
        </tr>`)
      .join("");
  }
  $("#blue-audit-card").hidden = state.selectedGame !== "ssq";
  if (state.selectedGame === "ssq") {
    const blue = audit.ssq_blue;
    const names = {
      uniform: "均匀基线",
      long_500: "500期长期",
      short_14: "14期短期",
      markov: "马尔可夫",
    };
    $("#blue-audit-body").innerHTML = Object.entries(blue.models)
      .map(([key, row]) => `
        <tr class="${key === blue.formal_model ? "is-selected" : ""}">
          <td>${names[key] || key}</td>
          <td class="numeric">${formatBrier(row.brier)}</td>
          <td class="numeric ${row.gain_bps >= 0 ? "positive" : "negative"}">${formatBps(row.gain_bps)}</td>
          <td>${row.top.map((number) => String(number).padStart(2, "0")).join(" ")}</td>
        </tr>`)
      .join("");
    setText(
      "#blue-audit-note",
      `${blue.verdict} 评价 ${formatInteger(blue.evaluated_draws)} 期。`
    );
  }
  const quality = $("#data-quality-body");
  if (quality) {
    quality.innerHTML = ["dlt", "ssq", "kl8", "pl5", "pl3"]
      .map((key) => {
        const row = audit.data_quality?.[key];
        if (!row) return "";
        return `
          <tr>
            <td>${escapeHtml(GAME_TREE_META[key]?.name || key)}</td>
            <td class="numeric">${formatInteger(row.draw_count)}</td>
            <td>${escapeHtml(row.start_date)} — ${escapeHtml(row.latest_date)}</td>
            <td class="numeric">${formatInteger(row.duplicate_issue_count)}</td>
            <td class="numeric">${formatInteger(row.invalid_record_count)}</td>
            <td><span class="mini-status ${row.status === "通过" ? "selected" : ""}">${escapeHtml(row.status)}</span></td>
          </tr>`;
      })
      .join("");
  }
}

function valueColor(value, min, max, alpha = 0.82) {
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  return `rgba(227, 89, 50, ${0.08 + ratio * alpha})`;
}

function renderCompactGrid(targetId, stats, metric) {
  const values = stats.map((item) => item[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const target = $(`#${targetId}`);
  target.innerHTML = stats
    .map(
      (item) => `
        <span class="number-cell" style="--cell-bg:${valueColor(item[metric], min, max, 0.68)}"
          title="${String(item.number).padStart(2, "0")}号：${item[metric]}次">
          ${String(item.number).padStart(2, "0")}
        </span>`
    )
    .join("");
}

function modelRows(data) {
  const rows = state.showAllModels ? data.candidates : data.candidates.slice(0, 12);
  $("#model-table-body").innerHTML = rows
    .map(
      (row) => `
        <tr class="${row.selected ? "is-selected" : ""}">
          <td><span class="rank-badge">${row.rank}</span></td>
          <td class="model-name">${escapeHtml(row.name)}</td>
          <td class="rule-summary">${escapeHtml(row.description)}</td>
          <td class="numeric">${formatBrier(row.dev_brier)}</td>
          <td class="numeric ${row.dev_delta_bps >= 0 ? "positive" : "negative"}">${formatBps(row.dev_delta_bps)}</td>
          <td class="numeric">${row.complexity}</td>
          <td><span class="mini-status ${row.selected ? "selected" : ""}">${row.selected ? "采用" : "候选"}</span></td>
        </tr>`
    )
    .join("");
}

function populateFusion(data) {
  const fusion = data.fusion;
  if (!fusion) return;
  const selection = fusion.selection;
  const metrics = fusion.metrics;
  const status = $("#fusion-status");
  status.textContent = selection.passes_gate ? "融合通过" : "均匀先验胜出";
  status.classList.toggle("success", selection.passes_gate);
  setText("#fusion-selected", fusion.selected_model);
  setText("#fusion-verdict", fusion.verdict);
  setText("#fusion-validation-gain", formatBps(selection.validation_gain_bps));
  setText(
    "#fusion-ci",
    `${formatBps(selection.validation_ci_low_bps)} 至 ${formatBps(selection.validation_ci_high_bps)}`
  );
  setText("#fusion-holdout-gain", formatBps(selection.holdout_gain_bps));
  const modelNames = Object.fromEntries(
    fusion.market_models.map((model) => [model.key, model.name])
  );
  const nonUniformWeights = Object.entries(fusion.selected_weights).filter(
    ([key]) => key !== "uniform"
  );
  setText(
    "#fusion-weight",
    nonUniformWeights.length
      ? nonUniformWeights
          .sort((a, b) => b[1] - a[1])
          .map(([key, weight]) => `${modelNames[key] || key} ${formatRate(weight)}`)
          .join(" · ")
      : "均匀先验 100%"
  );

  $("#market-model-grid").innerHTML = fusion.market_models
    .map(
      (model) => `
        <article class="market-model ${model.rank === 1 ? "is-best" : ""}">
          <span class="model-rank">${String(model.rank).padStart(2, "0")}</span>
          <span>${escapeHtml(model.family)}</span>
          <strong>${escapeHtml(model.name)}</strong>
          <small>${escapeHtml(model.description)}</small>
          <div class="model-gain">
            <span>验证改善</span>
            <b class="${model.validation_gain_bps > 0 ? "positive" : ""}">${formatBps(model.validation_gain_bps)}</b>
          </div>
        </article>`
    )
    .join("");

  $("#fusion-candidate-body").innerHTML = fusion.fusion_candidates
    .slice(0, 10)
    .map(
      (row) => `
        <tr>
          <td><span class="rank-badge">${row.rank}</span></td>
          <td class="model-name">${escapeHtml(row.name)}</td>
          <td class="numeric">${formatBrier(row.validation_brier)}</td>
          <td class="numeric">${formatBps((uniformValidationBrier(fusion) - row.validation_brier) * 10000)}</td>
          <td class="model-list">${row.models.map((key) => escapeHtml(modelNames[key] || key)).join(" · ")}</td>
        </tr>`
    )
    .join("");

  $("#composition-grid").innerHTML = fusion.composition_models
    .map(
      (model) => `
        <div title="${escapeHtml(model.description)}">
          <span>${escapeHtml(model.role)}</span>
          <strong>${escapeHtml(model.name)}</strong>
          <small>${escapeHtml(model.status)}</small>
        </div>`
    )
    .join("");
}

function uniformValidationBrier(fusion) {
  return Number(fusion.metrics.uniform_validation_brier);
}

function renderRankingChart(data) {
  const rows = data.candidates.slice(0, 10);
  const width = 900;
  const rowHeight = 32;
  const height = rows.length * rowHeight + 58;
  const labelWidth = 185;
  const right = 60;
  const plotWidth = width - labelWidth - right;
  const maxAbs = Math.max(0.2, ...rows.map((row) => Math.abs(row.dev_delta_bps))) * 1.15;
  const zero = labelWidth + plotWidth / 2;
  const scale = plotWidth / 2 / maxAbs;
  const grid = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs]
    .map(
      (tick) => `
        <line x1="${zero + tick * scale}" y1="18" x2="${zero + tick * scale}" y2="${height - 27}"
          stroke="${tick === 0 ? "currentColor" : chartTheme.line}" stroke-width="${tick === 0 ? 1.3 : 1}" opacity="${tick === 0 ? 0.65 : 0.8}" />
        <text x="${zero + tick * scale}" y="${height - 10}" text-anchor="middle" font-size="9" fill="${chartTheme.text}">${tick.toFixed(1)}</text>`
    )
    .join("");
  const bars = rows
    .map((row, index) => {
      const y = 24 + index * rowHeight;
      const value = Number(row.dev_delta_bps);
      const barX = value >= 0 ? zero : zero + value * scale;
      const barWidth = Math.max(1, Math.abs(value) * scale);
      const color = row.selected
        ? chartTheme.accent
        : value >= 0
          ? chartTheme.muted
          : chartTheme.subdued;
      return `
        <g>
          <text x="${labelWidth - 13}" y="${y + 15}" text-anchor="end" font-size="10" font-weight="700" fill="${chartTheme.baseline}">${escapeHtml(row.name)}</text>
          <rect x="${barX}" y="${y + 4}" width="${barWidth}" height="16" rx="4" fill="${color}" opacity="${row.selected ? 0.95 : 0.67}">
            <title>${escapeHtml(row.name)}：${formatBps(value)}</title>
          </rect>
          <text x="${zero + Math.sign(value || 1) * (barWidth + 7)}" y="${y + 16}" text-anchor="${value >= 0 ? "start" : "end"}"
            font-size="9" font-weight="700" fill="${chartTheme.text}">${value >= 0 ? "+" : ""}${value.toFixed(2)}</text>
        </g>`;
    })
    .join("");
  $("#ranking-chart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="开发集前十个模型的Brier改善排名">
      <title>开发集候选模型 Brier 改善</title>
      <desc>正值表示模型损失低于均匀基线，单位为基点。</desc>
      ${grid}${bars}
    </svg>`;
}

function movingAverage(values, windowSize) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const subset = values.slice(start, index + 1);
    return subset.reduce((sum, value) => sum + value, 0) / subset.length;
  });
}

function renderBacktestChart(data) {
  const series = data.holdout_series;
  if (!series.length) {
    $("#backtest-chart").innerHTML = '<p class="empty-state">暂无留出回测数据</p>';
    return;
  }
  const selected = movingAverage(series.map((row) => row.selected_brier), 20);
  const uniform = movingAverage(series.map((row) => row.uniform_brier), 20);
  const all = [...selected, ...uniform];
  const minValue = Math.min(...all) * 0.985;
  const maxValue = Math.max(...all) * 1.015;
  const width = 920;
  const height = 310;
  const padding = { left: 58, right: 24, top: 22, bottom: 39 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (index) => padding.left + (index / Math.max(1, series.length - 1)) * plotWidth;
  const y = (value) => padding.top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;
  const path = (values) =>
    values
      .map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`)
      .join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxValue - (maxValue - minValue) * ratio;
    const tickY = padding.top + plotHeight * ratio;
    return `<line x1="${padding.left}" y1="${tickY}" x2="${width - padding.right}" y2="${tickY}" stroke="${chartTheme.line}" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${tickY + 3}" text-anchor="end" font-size="9" fill="${chartTheme.text}">${value.toFixed(5)}</text>`;
  }).join("");
  const xTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const index = Math.min(series.length - 1, Math.round((series.length - 1) * ratio));
      return `<text x="${x(index)}" y="${height - 14}" text-anchor="middle" font-size="9" fill="${chartTheme.text}">${series[index].issue}</text>`;
    })
    .join("");
  const dots = series
    .map(
      (row, index) => `
        <g>
          <circle cx="${x(index)}" cy="${y(selected[index])}" r="9" fill="transparent">
            <title>${row.issue} ${row.date}｜采用模型 ${selected[index].toFixed(6)}｜均匀基线 ${uniform[index].toFixed(6)}</title>
          </circle>
        </g>`
    )
    .join("");

  $("#backtest-chart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="最后240期Brier滚动平均曲线">
      <title>留出集 Brier 损失曲线</title>
      <desc>比较采用模型与均匀基线在最后240期上的20期滚动平均概率损失。</desc>
      ${ticks}${xTicks}
      <path d="${path(uniform)}" fill="none" stroke="${chartTheme.muted}" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.55" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${path(selected)}" fill="none" stroke="${chartTheme.accent}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
}

function populateBacktest(data) {
  const metrics = data.metrics;
  setText(
    "#holdout-window",
    `${data.validation.holdout_start_issue} — ${data.validation.holdout_end_issue}`
  );
  setText("#holdout-brier", formatBrier(metrics.selected.holdout_brier));
  setText("#holdout-gain", formatBps(metrics.selected.holdout_gain_bps));
  setText(
    "#holdout-gain-copy",
    Math.abs(metrics.selected.holdout_gain_bps) < 0.01
      ? "留出集与基线持平"
      : metrics.selected.holdout_gain_bps > 0
        ? "留出集有所改善"
        : "留出集未复现优势"
  );
  setText("#challenger-name", metrics.challenger.name);
  setText(
    "#challenger-gain",
    `留出集 ${formatBps(metrics.challenger.holdout_gain_bps)}`
  );
  const recent = [...data.holdout_series].reverse().slice(0, 12);
  $("#settlement-table-body").innerHTML = recent
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.issue)}</td>
          <td>${formatDate(row.date)}</td>
          <td class="numeric">${formatBrier(row.selected_brier)}</td>
          <td class="numeric">${formatBrier(row.uniform_brier)}</td>
          <td class="numeric">${row.top_hits} / 5</td>
        </tr>`
    )
    .join("");
  renderBacktestChart(data);
}

function populateNumbers(data) {
  renderDetailedNumbers();
  $("#recent-draw-list").innerHTML = data.recent_draws
    .map(
      (draw) => `
        <div class="recent-row">
          <span>${escapeHtml(draw.issue)}</span>
          <div class="recent-balls">${balls(draw.front, draw.back, true)}</div>
        </div>`
    )
    .join("");
}

function renderDetailedNumbers() {
  if (!state.analysis) return;
  const stats = state.analysis.number_stats[state.numberArea];
  const metric = state.numberMetric;
  const values = stats.map((item) => item[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const grid = $("#number-grid");
  grid.classList.toggle("back-detail", state.numberArea === "back");
  const captions = {
    count_100: "次数越深，近 100 期出现越频繁",
    omission: "颜色越深，距离上次出现越久",
    count_all: "颜色越深，历史累计出现次数越多",
  };
  setText("#number-caption", captions[metric]);
  grid.innerHTML = stats
    .map(
      (item) => `
        <div class="number-cell" style="--cell-bg:${valueColor(item[metric], min, max)}"
          title="${String(item.number).padStart(2, "0")}号｜近100期 ${item.count_100} 次｜遗漏 ${item.omission} 期｜累计 ${item.count_all} 次">
          <span><strong>${String(item.number).padStart(2, "0")}</strong><small>${item[metric]}</small></span>
        </div>`
    )
    .join("");
}

function populateData(data) {
  const source = data.source;
  const baseline = data.baseline;
  setText("#audit-file", source.file);
  setText("#audit-count", numberFormatter.format(source.draw_count));
  setText("#audit-range", `${source.start_date} — ${source.latest_date}`);
  setText("#audit-latest", `${source.latest_issue} / ${source.latest_date}`);
  setText("#front-single-prob", formatPercent(baseline.front_single));
  setText("#back-single-prob", formatPercent(baseline.back_single));
  setText("#front-combinations", numberFormatter.format(baseline.front_combinations));
  setText("#jackpot-odds", `1 / ${numberFormatter.format(baseline.jackpot_odds)}`);
  setText("#footer-timestamp", `分析生成于 ${data.generated_at.replace("T", " ")}`);
  setText("#footer-disclaimer", data.disclaimer);
}

function renderQuantBudget() {
  if (!state.analysis?.quant) return;
  const quant = state.analysis.quant;
  const current = quant.budgets[state.quantBudget];
  if (!current) return;

  setText(
    "#quant-budget-label",
    `¥${current.budget} · ${current.ticket_count} 注`
  );
  setText(
    "#quant-expected-budget-net",
    `按历史返奖率，期望净损 ${formatMoney(current.expected_net)}`
  );
  setText("#quant-random-rate", formatRate(current.random_any_prize));
  setText("#quant-coverage-rate", formatRate(current.coverage_any_prize));
  setText(
    "#quant-coverage-lift",
    `+${formatRate(current.relative_lift)}`
  );
  $("#quant-random-bar").style.width = `${current.random_any_prize * 100}%`;
  $("#quant-coverage-bar").style.width = `${current.coverage_any_prize * 100}%`;
  $("#quant-portfolio").innerHTML = current.coverage_portfolio
    .map(
      (ticket, index) => `
        <div class="quant-ticket">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div class="recent-balls">${balls(ticket.front, ticket.back, true)}</div>
        </div>`
    )
    .join("");

  $$(".budget-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.budget === state.quantBudget);
  });

  $$(".jackpot-year").forEach((button) => {
    button.addEventListener("click", () => {
      state.jackpotYears = Number(button.dataset.years);
      renderJackpotTable();
    });
  });
}

function populateQuant(data) {
  const quant = data.quant;
  if (!quant) {
    $("#quant-portfolio").innerHTML =
      '<p class="empty-state">请重新生成量化分析结果。</p>';
    return;
  }
  setText("#quant-payout-ratio", formatRate(quant.expected_return_ratio));
  setText("#quant-house-edge", formatRate(quant.house_edge));
  setText("#quant-expected-prize", formatMoney(20 * quant.expected_return_ratio));
  setText("#quant-expected-net", formatMoney(20 * (quant.expected_return_ratio - 1)));
  setText("#quant-risk-copy", quant.explanation);
  setText("#quant-risk-rule", quant.risk_budget_rule);
  renderQuantBudget();
}

function renderAlphaChart(cycles) {
  const rows = cycles.alpha_scan;
  const width = 900;
  const height = 270;
  const padding = { left: 58, right: 30, top: 25, bottom: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = rows.map((row) => Number(row.brier));
  const minValue = Math.min(...values) * 0.997;
  const maxValue = Math.max(...values) * 1.003;
  const x = (alpha) => padding.left + ((alpha + 1) / 2) * plotWidth;
  const y = (value) =>
    padding.top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;
  const path = rows
    .map(
      (row, index) =>
        `${index === 0 ? "M" : "L"}${x(row.alpha).toFixed(2)},${y(row.brier).toFixed(2)}`
    )
    .join(" ");
  const ticks = [-1, -0.5, 0, 0.5, 1]
    .map(
      (alpha) => `
        <line x1="${x(alpha)}" y1="${padding.top}" x2="${x(alpha)}" y2="${height - padding.bottom}" stroke="${chartTheme.line}" stroke-width="1"/>
        <text x="${x(alpha)}" y="${height - 17}" text-anchor="middle" font-size="9" fill="${chartTheme.text}">${alpha > 0 ? "+" : ""}${alpha}</text>`
    )
    .join("");
  const dots = rows
    .map(
      (row) => `
        <circle cx="${x(row.alpha)}" cy="${y(row.brier)}" r="${row.alpha === 0 ? 5 : 3.5}"
          fill="${row.alpha === 0 ? chartTheme.baseline : row.alpha < 0 ? chartTheme.muted : chartTheme.accent}">
          <title>${row.direction} α=${row.alpha.toFixed(2)}｜Brier ${row.brier.toFixed(6)}｜前区最高权重命中 ${row.front_hits.toFixed(3)}</title>
        </circle>`
    )
    .join("");
  const labels = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const value = maxValue - (maxValue - minValue) * ratio;
      const tickY = padding.top + plotHeight * ratio;
      return `<line x1="${padding.left}" y1="${tickY}" x2="${width - padding.right}" y2="${tickY}" stroke="${chartTheme.line}" stroke-width="1"/>
        <text x="${padding.left - 9}" y="${tickY + 3}" text-anchor="end" font-size="9" fill="${chartTheme.text}">${value.toFixed(5)}</text>`;
    })
    .join("");
  $("#alpha-chart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="最近五期延续与反转系数的Brier回测曲线">
      <title>五期热度延续与反转系数扫描</title>
      <desc>负值代表反转向冷号，正值代表延续热号，零为均匀基线。Brier越低越好。</desc>
      ${labels}${ticks}
      <path d="${path}" fill="none" stroke="${chartTheme.accent}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>`;
}

function populateCycles(data) {
  const cycles = data.cycles;
  if (!cycles) return;
  const front = cycles.lag_tests.front;
  const back = cycles.lag_tests.back;
  const front5 = cycles.lag_tests.lag5_front;
  const back5 = cycles.lag_tests.lag5_back;
  const anyLag = [...front, ...back].some((row) => row.significant);
  setText("#cycle-badge", anyLag ? "存在显著滞后" : "未确认离散周期");
  setText("#cycle-verdict", cycles.selection.verdict);
  setText("#cycle-structure-label", cycles.summary.structure_label);
  setText("#cycle-number-label", cycles.summary.number_label);
  setText("#cycle-execution-label", cycles.summary.execution_label);
  setText("#front-lag5-overlap", Number(front5.observed_overlap).toFixed(3));
  setText("#front-lag5-expected", Number(front5.expected_overlap).toFixed(3));
  setText(
    "#front-lag5-p",
    `校正 P = ${Number(front5.bonferroni_p).toFixed(3)}`
  );
  $("#front-lag5-p").classList.toggle("is-significant", front5.significant);
  setText("#back-lag5-overlap", Number(back5.observed_overlap).toFixed(3));
  setText("#back-lag5-expected", Number(back5.expected_overlap).toFixed(3));
  setText(
    "#back-lag5-p",
    `校正 P = ${Number(back5.bonferroni_p).toFixed(3)}`
  );
  $("#back-lag5-p").classList.toggle("is-significant", back5.significant);

  $("#cycle-lag-body").innerHTML = front
    .map((frontRow, index) => {
      const backRow = back[index];
      return `
        <tr>
          <td>${frontRow.lag}</td>
          <td class="numeric">${Number(frontRow.observed_overlap).toFixed(3)}</td>
          <td class="numeric ${frontRow.significant ? "positive" : ""}">${Number(frontRow.bonferroni_p).toFixed(3)}</td>
          <td class="numeric">${Number(backRow.observed_overlap).toFixed(3)}</td>
          <td class="numeric ${backRow.significant ? "positive" : ""}">${Number(backRow.bonferroni_p).toFixed(3)}</td>
        </tr>`;
    })
    .join("");

  $("#block-direction-list").innerHTML = cycles.block_tests.direction_tests
    .map((row) => {
      const position = Number(row.continuation_rate) * 100;
      return `
        <div class="block-direction-row ${row.significant ? "is-significant" : ""}">
          <span>${escapeHtml(row.label)}</span>
          <div class="direction-meter" title="延续 ${formatRate(row.continuation_rate)}，反转 ${formatRate(row.reversal_rate)}">
            <i style="left:${position}%"></i>
          </div>
          <small>${row.significant ? (row.continuation_rate > row.reversal_rate ? "显著延续" : "显著反转") : "不显著"}</small>
        </div>`;
    })
    .join("");

  $("#cycle-front-extension").innerHTML = cycles.latest_window.front
    .map((number) => `<span class="ball small">${String(number).padStart(2, "0")}</span>`)
    .join("");
  $("#cycle-back-extension").innerHTML = cycles.latest_window.back
    .map((number) => `<span class="ball back small">${String(number).padStart(2, "0")}</span>`)
    .join("");

  const switching = cycles.metrics.switching;
  setText(
    "#cycle-switch-result",
    `切换策略 ${formatBps(switching.gain_bps)}`
  );
  const choices = Object.entries(switching.alpha_choices)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([alpha, count]) => `α ${alpha}: ${count} 期`)
    .join(" · ");
  setText("#cycle-switch-detail", `最近 240 期方向选择：${choices}`);
  renderAlphaChart(cycles);
}

function populateMultiframe(data) {
  const multi = data.multiframe;
  if (!multi) return;
  const status = $("#mtf-status");
  status.textContent = multi.selected.passes_gate ? "通过门槛" : "方向翻转";
  status.classList.toggle("success", multi.selected.passes_gate);
  const direction = (beta) => (beta > 0 ? "延续" : beta < 0 ? "反转" : "中性");
  setText(
    "#mtf-train",
    `α ${Number(multi.training_best.alpha).toFixed(2)} / β ${Number(multi.training_best.beta).toFixed(2)}`
  );
  setText(
    "#mtf-validation",
    `α ${Number(multi.validation_best.alpha).toFixed(2)} / β ${Number(multi.validation_best.beta).toFixed(2)}`
  );
  setText(
    "#mtf-selected",
    multi.selected.passes_gate ? multi.selected.name : "均匀基线"
  );
  setText(
    "#mtf-gate",
    `验证改善 ${formatBps(multi.selection_gate.validation_gain_bps)}`
  );
  setText("#mtf-verdict", multi.verdict);
  $("#mtf-table-body").innerHTML = multi.comparisons
    .map(
      (row) => `
        <tr>
          <td class="forecast-name">${escapeHtml(row.name)}</td>
          <td class="numeric">${Number(row.alpha).toFixed(2)}</td>
          <td class="numeric">${Number(row.beta).toFixed(2)} · ${direction(row.beta)}</td>
          <td class="numeric ${row.validation_gain_bps >= 0 ? "positive" : "negative"}">${formatBps(row.validation_gain_bps)}</td>
          <td class="numeric ${row.holdout_gain_bps >= 0 ? "positive" : "negative"}">${formatBps(row.holdout_gain_bps)}</td>
        </tr>`
    )
    .join("");

  const width = 430;
  const height = 120;
  const x = (value) => 20 + ((value + 0.4) / 0.8) * (width - 40);
  const y = (value) => height - 18 - ((value + 0.4) / 0.8) * (height - 36);
  const originX = x(0);
  const originY = y(0);
  $("#mtf-plane").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="十期背景与五期规律参数落点">
      <title>10+5 多周期参数落点</title>
      <desc>训练集最优与验证集最优位于不同象限，说明短期延续和反转方向不稳定。</desc>
      <line x1="${originX}" y1="10" x2="${originX}" y2="${height - 10}" stroke="${chartTheme.line}" stroke-width="1"/>
      <line x1="10" y1="${originY}" x2="${width - 10}" y2="${originY}" stroke="${chartTheme.line}" stroke-width="1"/>
      <circle cx="${x(multi.training_best.alpha)}" cy="${y(multi.training_best.beta)}" r="6" fill="${chartTheme.accent}"/>
      <text x="${x(multi.training_best.alpha) + 9}" y="${y(multi.training_best.beta) - 8}" font-size="9" font-weight="700" fill="${chartTheme.baseline}">训练最优</text>
      <circle cx="${x(multi.validation_best.alpha)}" cy="${y(multi.validation_best.beta)}" r="6" fill="${chartTheme.muted}"/>
      <text x="${x(multi.validation_best.alpha) + 9}" y="${y(multi.validation_best.beta) + 14}" font-size="9" font-weight="700" fill="${chartTheme.text}">验证最优</text>
    </svg>`;

  const tickets = multi.next_tickets;
  const renderTicket = (ticket) =>
    ticket
      ? `${ticket.front.map((number) => `<span class="ball small">${String(number).padStart(2, "0")}</span>`).join("")}${ticket.back.map((number) => `<span class="ball back small">${String(number).padStart(2, "0")}</span>`).join("")}`
      : "";
  $("#mtf-train-ticket").innerHTML = renderTicket(tickets[0]);
  $("#mtf-validation-ticket").innerHTML = renderTicket(tickets[1]);
}

function activateTab(tab, navTab = tab) {
  $$(".nav-button").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.tab === navTab);
  });
  let activePanel = null;
  $$(".tab-panel").forEach((panel) => {
    const active = panel.dataset.panel === tab;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
    if (active) activePanel = panel;
  });
  if (tab === "backtest" && state.analysis) {
    renderBacktestChart(state.analysis);
  }
  $$(".data-subnav [data-data-page]").forEach((button) => {
    const page = tab === "numbers" ? "numbers" : "summary";
    button.classList.toggle("is-active", button.dataset.dataPage === page);
  });
  if (tab === "overview") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (activePanel) {
    activePanel.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  if (["models", "backtest", "cycles", "quant", "numbers", "data"].includes(tab)) {
    ensureAnalysis().catch(console.error);
  }
  if (["backtest", "multi", "data"].includes(tab)) {
    ensureResearchAudit().catch(console.error);
  }
  if (tab === "quant") {
    loadScreeningReport().catch(console.error);
  }
  if (tab === "multi") {
    ensureMultiData(state.selectedGame).catch(console.error);
  }
}

function setupTabs() {
  $(".top-nav")?.addEventListener("click", (event) => {
    const button = event.target.closest(".nav-button");
    if (button) activateTab(button.dataset.tab);
  });
}

function setupInteractions() {
  $$("[data-data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(
        button.dataset.dataPage === "numbers" ? "numbers" : "data",
        "data"
      );
    });
  });
  $("#back-to-data").addEventListener("click", () => activateTab("data"));

  $("#tree-game-grid").addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-tree-action]");
    if (!trigger) return;
    const gameKey = trigger.dataset.treeGame;
    const action = trigger.dataset.treeAction;
    if (!GAME_TREE_META[gameKey]) return;
    state.selectedGame = gameKey;
    if (action === "rule") {
      $("#bet-game").value = gameKey;
      syncBetFields();
      activateTab("quant");
      return;
    }
    if (action === "pattern") {
      activateTab("cycles");
      window.setTimeout(() => {
        $(".regime-audit")?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      }, 80);
      return;
    }
    renderMultiGame();
    activateTab("multi");
    if (action === "model") {
      window.setTimeout(() => {
        $(".multi-model-card")?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      }, 80);
    }
  });

  $$("[data-tree-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = $(`.nav-button[data-tab="${button.dataset.treeTab}"]`);
      if (target) target.click();
    });
  });

  $("#verdict-toggle").addEventListener("click", toggleEvidence);
  $("#verdict-evidence").addEventListener("toggle", (event) => {
    $("#verdict-toggle").setAttribute(
      "aria-expanded",
      String(event.currentTarget.open)
    );
  });

  $("#bet-game").addEventListener("change", syncBetFields);
  $("#bet-structure").addEventListener("change", syncBetFields);
  $("#bet-play").addEventListener("change", syncBetFields);
  $("#bet-calculate").addEventListener("click", () => requestBet("calculate"));
  $("#bet-generate").addEventListener("click", () => requestBet("package"));
  $("#screening-generate").addEventListener("click", generateScreeningPackage);
  $("#recent-five-game").addEventListener("change", (event) => {
    loadRecentFive(event.target.value);
  });
  $("#copy-package").addEventListener("click", async () => {
    if (!state.betPackage) return;
    const text = [
      `覆盖票包（规则生成，非预测）`,
      `注数 ${state.betPackage.tickets} · 金额 ¥${state.betPackage.amount} · 覆盖率 ${formatCoverage(state.betPackage.coverage)} · 种子 ${state.betPackage.seed}`,
      ...state.betPackage.ticket_lines.map(
        (ticket, index) => `${String(index + 1).padStart(3, "0")} ${ticketText(ticket)}`
      ),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("覆盖票包已复制");
    } catch {
      showToast("当前浏览器未开放剪贴板权限");
    }
  });

  $("#show-all-models").addEventListener("change", (event) => {
    state.showAllModels = event.target.checked;
    if (state.analysis) modelRows(state.analysis);
  });

  $("#ticket-image").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    state.ticketImageData = file ? await readFileAsDataUrl(file) : null;
  });
  $("#ticket-game").addEventListener("change", (event) => {
    $("#ticket-play-field").hidden = event.target.value !== "kl8";
  });
  $("#ticket-check-text").addEventListener("click", () => submitTicketCheck(false));
  $("#ticket-check-image").addEventListener("click", () => submitTicketCheck(true));

  $$(".segment[data-area]").forEach((button) => {
    button.addEventListener("click", () => {
      state.numberArea = button.dataset.area;
      $$(".segment[data-area]").forEach((item) =>
        item.classList.toggle("is-active", item === button)
      );
      renderDetailedNumbers();
    });
  });

  $$(".metric-segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.numberMetric = button.dataset.metric;
      $$(".metric-segment").forEach((item) =>
        item.classList.toggle("is-active", item === button)
      );
      renderDetailedNumbers();
    });
  });

  $("#copy-tickets").addEventListener("click", async () => {
    if (!state.analysis) return;
    const text = state.analysis.recommendations
      .map(
        (ticket) =>
          `${ticket.label}：${ticket.front.map((number) => String(number).padStart(2, "0")).join(" ")} + ${ticket.back.map((number) => String(number).padStart(2, "0")).join(" ")}`
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("三组规则号码已复制");
    } catch {
      showToast("当前浏览器未开放剪贴板权限");
    }
  });

  $$(".budget-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.quantBudget = button.dataset.budget;
      renderQuantBudget();
    });
  });

  $("#copy-quant-portfolio").addEventListener("click", async () => {
    const current = state.analysis?.quant?.budgets?.[state.quantBudget];
    if (!current) return;
    const text = current.coverage_portfolio
      .map(
        (ticket, index) =>
          `${String(index + 1).padStart(2, "0")}：${ticket.front.map((number) => String(number).padStart(2, "0")).join(" ")} + ${ticket.back.map((number) => String(number).padStart(2, "0")).join(" ")}`
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast(`已复制 ¥${current.budget} 覆盖组合`);
    } catch {
      showToast("当前浏览器未开放剪贴板权限");
    }
  });

  $("#export-button").addEventListener("click", () => {
    if (!state.analysis) return;
    const blob = new Blob([JSON.stringify(state.analysis, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `dlt-analysis-${state.analysis.source.latest_issue}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("分析结果已导出");
  });

  $("#refresh-page").addEventListener("click", () => window.location.reload());
}

async function fetchUpdateStatus() {
  const response = await fetch("./api/status", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchWithRetry(url, options = {}, attempts = 2) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }
  }
  throw lastError || new Error("网络请求失败");
}

function setDataLoading(active, message = "正在加载详细数据…") {
  const node = $("#data-load-state");
  if (!node) return;
  node.hidden = !active;
  if (active) node.lastElementChild.textContent = message;
}

function beginDataLoad(message) {
  loadingRequests += 1;
  setDataLoading(true, message);
}

function endDataLoad() {
  loadingRequests = Math.max(0, loadingRequests - 1);
  if (loadingRequests === 0) setDataLoading(false);
}

async function ensureAnalysis() {
  if (state.analysis) return state.analysis;
  if (!analysisRequest) {
    beginDataLoad("正在加载模型与回测数据…");
    analysisRequest = fetchWithRetry("./analysis.json", { credentials: "omit" })
      .then((response) => response.json())
      .then((data) => {
        render(data);
        return data;
      })
      .catch((error) => {
        analysisRequest = null;
        showToast("模型数据加载失败，请稍后重试");
        throw error;
      })
      .finally(endDataLoad);
  }
  return analysisRequest;
}

async function ensureResearchAudit() {
  if (state.researchAudit) {
    renderResearchAudit();
    return state.researchAudit;
  }
  if (!researchRequest) {
    beginDataLoad("正在加载长期审计与账本…");
    researchRequest = fetchWithRetry("./research-audit.json", {
      credentials: "omit",
    })
      .then((response) => response.json())
      .then((data) => {
        state.researchAudit = data;
        renderResearchAudit();
        return data;
      })
      .catch((error) => {
        researchRequest = null;
        showToast("长期审计数据加载失败");
        throw error;
      })
      .finally(endDataLoad);
  }
  return researchRequest;
}

async function ensureMultiData(gameKey = state.selectedGame) {
  if (state.multiData?.games?.[gameKey]) return state.multiData;
  if (multiGameRequests.has(gameKey)) return multiGameRequests.get(gameKey);
  beginDataLoad(`正在加载${GAME_TREE_META[gameKey]?.name || "彩种"}数据…`);
  const request = fetchWithRetry(`./games/${gameKey}.json`, { credentials: "omit" })
    .then((response) => response.json())
    .then((payload) => {
      populateMultilottery(payload);
      return state.multiData;
    })
    .catch(async (splitError) => {
      console.warn("分彩种文件不可用，回退到合并文件", splitError);
      if (!multiRequest) {
        multiRequest = fetchWithRetry("./multilottery.json", {
          credentials: "omit",
        }).then((response) => response.json());
      }
      const combined = await multiRequest;
      populateMultilottery(combined);
      return state.multiData;
    })
    .catch((error) => {
      showToast("彩种数据加载失败，请稍后重试");
      throw error;
    })
    .finally(() => {
      multiGameRequests.delete(gameKey);
      endDataLoad();
    });
  multiGameRequests.set(gameKey, request);
  return request;
}

async function refreshAnalysisFromServer() {
  const version = Date.now();
  const analysisResponse = await fetchWithRetry(
    `./analysis.json?v=${version}`,
    { cache: "no-store" }
  );
  if (!analysisResponse.ok) throw new Error(`HTTP ${analysisResponse.status}`);
  render(await analysisResponse.json());
  state.multiData = null;
  multiGameRequests.clear();
  await ensureMultiData(state.selectedGame);
  researchRequest = null;
  state.researchAudit = null;
  await ensureResearchAudit();
}

function setUpdaterUi(status, running = false) {
  const button = $("#update-data");
  const label = $("#update-status");
  const dot = $("#update-dot");
  button.classList.toggle("is-busy", running);
  button.disabled = running;
  dot.classList.toggle("is-busy", running);
  dot.classList.toggle("is-error", status === "error");
  if (running) {
    label.textContent = "更新中";
  } else if (status === "error") {
    label.textContent = "更新失败";
  } else {
    label.textContent = "检查开奖";
  }
}

async function waitForUpdate() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const status = await fetchUpdateStatus();
    if (!status.running) {
      setUpdaterUi(status.success === false ? "error" : "idle");
      if (status.success) {
        await refreshAnalysisFromServer();
        showToast(`已更新至 ${status.latest_issue}，下一期 ${status.next_issue || ""}`);
      } else {
        showToast(status.message || "开奖更新失败");
      }
      return status;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  setUpdaterUi("error");
  showToast("更新耗时较长，请稍后刷新");
  return null;
}

async function triggerDataUpdate(auto = false) {
  try {
    const response = await fetch("./api/update", { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setUpdaterUi("running", true);
    if (!auto) showToast("正在获取官方开奖并重新推演");
    await waitForUpdate();
  } catch (error) {
    console.error(error);
    setUpdaterUi("error");
    if (!auto) showToast("自动更新接口不可用");
  }
}

async function checkForLatestDraw(auto = true) {
  try {
    const status = await fetchUpdateStatus();
    setUpdaterUi(status.success === false ? "error" : "idle", Boolean(status.running));
    if (status.running) {
      await waitForUpdate();
      return;
    }
    if (
      state.analysis &&
      status.latest_issue &&
      status.latest_issue !== state.analysis.source.latest_issue
    ) {
      await triggerDataUpdate(auto);
    } else if (status.latest_issue) {
      setText("#shortterm-update-state", `已到 ${status.latest_issue}`);
    }
  } catch (error) {
    console.error(error);
    setUpdaterUi("error");
  }
}

function rearrangeDashboardSections() {
  const calculator = $("#calculator");
  const packageCard = $(".package-card");
  const recentFive = $(".recent-five-card");
  const shortterm = $(".shortterm-card");
  const toolsPanel = $("#panel-quant");
  const dataPanel = $("#panel-data");
  const cyclesPanel = $("#panel-cycles");
  if (calculator && packageCard && toolsPanel) {
    const heading = toolsPanel.querySelector(".panel-heading");
    if (heading) {
      heading.insertAdjacentElement("afterend", calculator);
      calculator.insertAdjacentElement("afterend", packageCard);
    } else {
      toolsPanel.prepend(packageCard);
      toolsPanel.prepend(calculator);
    }
  }
  if (recentFive && dataPanel) {
    const subnav = dataPanel.querySelector(".data-subnav");
    if (subnav) subnav.insertAdjacentElement("afterend", recentFive);
    else dataPanel.prepend(recentFive);
  }
  if (shortterm && cyclesPanel) {
    const heading = cyclesPanel.querySelector(".panel-heading");
    if (heading) heading.insertAdjacentElement("afterend", shortterm);
    else cyclesPanel.prepend(shortterm);
  }
}

function runAfterPaint(callback) {
  window.requestAnimationFrame(() => window.setTimeout(callback, 0));
}

function render(data) {
  state.analysis = data;
  populateVerdict(data);
  populateDecisionTree(data);
  runAfterPaint(() => {
    populateHeader(data);
    populateOverview(data);
    populateShortterm(data);
    populateRegime(data);
    populatePatterns(data);
    populateForecast(data);
    populateFusion(data);
    modelRows(data);
    renderRankingChart(data);
    populateBacktest(data);
    populateCycles(data);
    populateMultiframe(data);
    populateQuant(data);
    populateJackpot(data);
    populateSchemeAudit(data);
    populateNumbers(data);
    populateData(data);
  });
}

async function init() {
  performance.mark("app-init");
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  window.scrollTo(0, 0);
  rearrangeDashboardSections();
  setupTabs();
  setupInteractions();
  syncBetFields();
  try {
    const overviewResponse = await fetchWithRetry("./overview.json", {
      credentials: "omit",
    }).catch(() => null);
    if (overviewResponse?.ok) {
      try {
        const overview = await overviewResponse.json();
        if (overview.analysis) {
          populateVerdict(overview.analysis);
          populateDecisionTree(overview.analysis);
        }
        if (overview.analysis && overview.multilottery) {
          populateGameTree(overview.analysis, overview.multilottery);
        }
        performance.mark("overview-ready");
      } catch (overviewError) {
        console.error(overviewError);
      }
    }

    window.setTimeout(() => loadRecentFive("dlt"), 250);
    window.setTimeout(() => {
      Promise.allSettled([ensureAnalysis()]).then(() => {
        performance.mark("analysis-ready");
      });
    }, 900);
    if (RUNTIME.staticMode) {
      const updateButton = $("#update-data");
      updateButton.disabled = true;
      updateButton.title = "静态发布站只读；数据由定时任务重建";
      setText("#update-status", "只读发布站");
      setText("#shortterm-update-state", "静态快照");
      $("#screening-generate").disabled = true;
      setText(
        "#screening-error",
        "条件票包需要本机计算服务；静态发布站保留研究结果只读查看。"
      );
      $("#ticket-check-text").disabled = true;
      $("#ticket-check-image").disabled = true;
      $("#ticket-result").innerHTML =
        '<p class="empty-state">静态发布站不执行 OCR 与验票；请在本机研究台使用。</p>';
    } else {
      $("#update-data").addEventListener("click", () => triggerDataUpdate(false));
      window.setTimeout(() => checkForLatestDraw(true), 1200);
      window.setInterval(() => checkForLatestDraw(true), 5 * 60 * 1000);
    }
  } catch (error) {
    console.error(error);
    $("#tree-game-grid").innerHTML =
      '<p class="empty-state">数据暂时未加载，请检查网络后刷新页面。</p>';
    $("#hero-meta").innerHTML = `<span>无法读取 analysis.json，请通过 python dlt_app.py 启动。</span>`;
    $("#recommendations").innerHTML =
      '<p class="empty-state">分析数据未生成。请运行启动脚本后刷新页面。</p>';
  }
}

init();
