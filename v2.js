const state = {
  data: null,
  ticketCount: 2,
  horizon: 12,
};

const numberFormatter = new Intl.NumberFormat("zh-CN");

function $(selector, root = document) {
  return root.querySelector(selector);
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return `¥${numberFormatter.format(Number(value))}`;
}

function formatRate(value) {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatOneIn(value) {
  return `1 / ${numberFormatter.format(Math.round(Number(value)))}`;
}

function balls(main, back = [], small = false) {
  return [
    ...main.map(
      (number) =>
        `<span class="ball${small ? " small" : ""}">${String(number).padStart(2, "0")}</span>`
    ),
    ...back.map(
      (number) =>
        `<span class="ball back${small ? " small" : ""}">${String(number).padStart(2, "0")}</span>`
    ),
  ].join("");
}

function renderTicketOptions() {
  const option =
    state.data.next.ticket_options[String(state.ticketCount)];
  setText(
    "#v2-ticket-meta",
    `${option.count}注 · ${formatMoney(option.cost)} · 规则生成，非预测`
  );
  $("#v2-tickets").innerHTML = option.tickets
    .map(
      (ticket, index) => `
        <div class="v2-ticket-row">
          <small>${String(index + 1).padStart(2, "0")}</small>
          <div>${balls(ticket.front, ticket.back, true)}</div>
        </div>`
    )
    .join("");
  document.querySelectorAll("#v2-ticket-switch button").forEach((button) => {
    button.classList.toggle(
      "is-active",
      Number(button.dataset.count) === state.ticketCount
    );
  });
}

function renderHorizon() {
  const plan =
    state.data.planner.horizon_plans[String(state.horizon)];
  const v2Any =
    state.horizon === Number(state.data.planner.default_horizon)
      ? state.data.planner.any_prize_probability_v2_plan
      : null;
  const randomAny =
    state.horizon === Number(state.data.planner.default_horizon)
      ? state.data.planner.any_prize_probability_random_plan
      : null;
  $("#v2-plan-metrics").innerHTML = `
    <div><span>总注数</span><strong>${numberFormatter.format(plan.total_tickets)} 注</strong></div>
    <div><span>总金额</span><strong>${formatMoney(plan.total_cost)}</strong></div>
    <div><span>唯一完整组合</span><strong>${numberFormatter.format(plan.unique_tickets)}</strong></div>
    <div><span>一等奖覆盖</span><strong>${formatOneIn(plan.first_prize_one_in)}</strong></div>
    ${v2Any == null ? "" : `<div><span>任意奖模拟</span><strong>${formatRate(v2Any)}</strong></div>`}
  `;
  $("#v2-schedule").innerHTML = plan.schedule
    .map(
      (row) => `
        <details class="v2-schedule-row">
          <summary>
            <span>${escapeHtml(row.issue)}</span>
            <small>${escapeHtml(row.date)}</small>
            <strong>${row.tickets.length}注 / ${formatMoney(row.tickets.length * 2)}</strong>
          </summary>
          <div>
            ${row.tickets
              .map(
                (ticket) =>
                  `<div class="v2-schedule-ticket">${balls(ticket.front, ticket.back, true)}</div>`
              )
              .join("")}
          </div>
        </details>`
    )
    .join("");
  document.querySelectorAll("#v2-horizon-switch button").forEach((button) => {
    button.classList.toggle(
      "is-active",
      Number(button.dataset.horizon) === state.horizon
    );
  });
  if (randomAny != null) {
    setText(
      "#v2-any-prize-random",
      `同预算随机模拟 ${formatRate(randomAny)}`
    );
  }
}

function render() {
  const data = state.data;
  setText("#v2-verdict", data.verdict);
  setText("#v2-next-issue", data.target.issue);
  setText("#v2-next-date", data.target.date);
  $("#v2-latest-balls").innerHTML = balls(
    data.target.latest_front,
    data.target.latest_back,
    true
  );
  setText(
    "#v2-selection-name",
    data.selection.execution_name
  );
  setText("#v2-selection-reason", data.selection.reason);
  const plan = data.planner.selected_plan;
  setText(
    "#v2-default-plan",
    `未来${plan.horizon}期 · 每期${plan.tickets_per_draw}注`
  );
  setText(
    "#v2-default-plan-cost",
    `${formatMoney(plan.total_cost)} · ${plan.total_tickets}注不同组合`
  );
  setText(
    "#v2-first-prize-probability",
    formatOneIn(plan.first_prize_one_in)
  );
  setText(
    "#v2-any-prize-probability",
    formatRate(data.planner.any_prize_probability_v2_plan)
  );
  setText("#v2-avoid-rule", data.next.avoid_previous_rule);
  renderTicketOptions();

  const maxWeight = Math.max(
    ...data.experts.map((expert) => Number(expert.weight))
  );
  $("#v2-expert-list").innerHTML = data.experts
    .map(
      (expert) => `
        <div class="v2-expert">
          <div>
            <strong>${escapeHtml(expert.name)}</strong>
            <small>Brier ${Number(expert.brier_120).toFixed(6)}</small>
          </div>
          <span><i style="width:${(Number(expert.weight) / maxWeight) * 100}%"></i></span>
          <b>${formatRate(expert.weight)}</b>
        </div>`
    )
    .join("");
  $("#v2-front-ranking").innerHTML = data.next.front_ranking
    .map(
      (number, index) =>
        `<span class="number-cell ${index < 5 ? "v2-top-number" : ""}">${String(number).padStart(2, "0")}</span>`
    )
    .join("");
  $("#v2-back-ranking").innerHTML = data.next.back_ranking
    .map(
      (number, index) =>
        `<span class="number-cell ${index < 2 ? "v2-top-number" : ""}">${String(number).padStart(2, "0")}</span>`
    )
    .join("");

  const labels = {
    v2_ensemble: "V2动态专家混合",
    uniform_diverse: "均匀分散",
    same_rule_random: "同规则随机",
    pure_random: "纯随机",
  };
  $("#v2-backtest-body").innerHTML = Object.entries(
    data.backtest.summaries
  )
    .map(
      ([key, row]) => `
        <tr class="${key === "v2_ensemble" ? "is-selected" : ""}">
          <td>${labels[key] || key}</td>
          <td class="numeric">${numberFormatter.format(row.draws)}</td>
          <td class="numeric">${formatMoney(row.cost)}</td>
          <td class="numeric">${formatRate(row.winning_rate)}</td>
          <td class="numeric">${row.first_prize_hits}</td>
          <td class="numeric">${formatMoney(row.payout_estimate)}</td>
          <td class="numeric">${row.max_losing_streak}</td>
        </tr>`
    )
    .join("");
  const gate = data.selection.gate;
  const status = $("#v2-gate-status");
  status.textContent = gate.passes_gate ? "排序优势通过" : "仅执行覆盖优化";
  status.classList.toggle("success", gate.passes_gate);
  setText(
    "#v2-gate-copy",
    `${gate.interpretation} 配对差值 ${formatRate(gate.paired_any_prize_delta)}，95%区间 ${formatRate(gate.ci_low)} 至 ${formatRate(gate.ci_high)}。`
  );
  const snapshots = data.snapshots || [];
  $("#v2-snapshot-body").innerHTML = snapshots.length
    ? snapshots
        .slice(0, 12)
        .map((snapshot) => {
          const outcomes = snapshot.actual?.outcomes || {};
          return `
            <tr>
              <td>${escapeHtml(snapshot.issue)}<small>${escapeHtml(snapshot.target_date)}</small></td>
              <td>${snapshot.status === "settled" ? "已复盘" : "待开奖"}<small>${escapeHtml(snapshot.record_kind === "live_frozen" ? "赛前冻结" : "旧记录")}</small></td>
              ${["1", "2", "3", "5"]
                .map((count) => {
                  const option = outcomes[count];
                  if (!option) return '<td class="numeric">—</td>';
                  return `<td class="numeric">${option.wins}注中奖<small>估算 ${formatMoney(option.payout_estimate)}</small></td>`;
                })
                .join("")}
            </tr>`;
        })
        .join("")
    : '<tr><td colspan="6">V2账本将在首次保存后生成。</td></tr>';
  setText("#v2-generated-at", `生成于 ${data.generated_at}`);
  renderHorizon();
}

function bind() {
  document.querySelectorAll("#v2-ticket-switch button").forEach((button) => {
    button.addEventListener("click", () => {
      state.ticketCount = Number(button.dataset.count);
      renderTicketOptions();
    });
  });
  document.querySelectorAll("#v2-horizon-switch button").forEach((button) => {
    button.addEventListener("click", () => {
      state.horizon = Number(button.dataset.horizon);
      renderHorizon();
    });
  });
}

async function init() {
  bind();
  try {
    const response = await fetch(`./v2.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    state.horizon = Number(state.data.planner.default_horizon);
    state.ticketCount = 2;
    render();
  } catch (error) {
    setText("#v2-verdict", `V2数据加载失败：${error.message}`);
    $("#toast").textContent = "V2数据暂时不可用";
    $("#toast").classList.add("is-visible");
  }
}

init();
