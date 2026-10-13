/**
 * Reproduce the published reviewer financing explanation from its retained
 * complete phase dates, costs and original customer milestone schedule.
 * This consumes the selected schedule; it does not allocate or move work.
 */
export function calculateFinancingBasis(data) {
  if (data.schema !== "stellar-forge.reviewer-financing-basis.v1")
    throw new Error("Select the complete reviewer financing basis");
  const money = value => {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
    if (!match) throw new Error("Invalid USD decimal: " + value);
    return (match[1] ? -1n : 1n) *
      (BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0")));
  };
  const usd = cents => (cents < 0n ? "-" : "") +
    (String(cents < 0n ? -cents : cents).padStart(3,"0").slice(0,-2)) + "." +
    String(cents < 0n ? -cents : cents).padStart(3,"0").slice(-2);
  const epoch = date => {
    const value = Date.parse(date + "T00:00:00Z");
    if (!Number.isFinite(value) || new Date(value).toISOString().slice(0,10) !== date)
      throw new Error("Invalid calendar date: " + date);
    return value / 86400000;
  };
  const stamp = day => new Date(day * 86400000).toISOString().slice(0,10);
  const award = epoch(data.basis.assumedAwardDate);
  const reserve = money(data.basis.lutraReserveUsd);
  const results = [];
  let checkedDailyRows = 0;
  for (const alternative of data.alternatives) {
    const phaseCost = alternative.tasks.reduce((n,t) => n + money(t.labor_cost),0n);
    if (phaseCost !== money(alternative.summary.labor_cost))
      throw new Error(alternative.id + ": phase costs differ from complete labor total");
    const curves = [];
    for (const source of alternative.cash) {
      const events = new Map();
      const add = (day, value) => events.set(day,(events.get(day) || 0n) + value);
      for (const task of alternative.tasks) {
        const start = epoch(task.first_work_date), end = epoch(task.finish_date);
        if (end < start) throw new Error("Phase finishes before it starts");
        const count = BigInt(end - start + 1), total = money(task.labor_cost);
        let previous = 0n;
        for (let offset=1n; offset<=count; offset++) {
          const cumulative = (2n * total * offset + count) / (2n * count);
          add(start + Number(offset) - 1,-(cumulative-previous));
          previous = cumulative;
        }
      }
      for (const payment of data.basis.grantPayments)
        add(award + payment.day + (payment.day ? source.grantReviewPaymentLagDays : 0),
          money(payment.amountUsd));
      for (const milestone of source.customerMilestones) {
        const expectedDate = stamp(epoch(milestone.triggerDate) +
          milestone.originalDueDays + milestone.additionalCollectionDelayDays);
        if (expectedDate !== milestone.receiptDate)
          throw new Error("Original milestone date mismatch");
        add(epoch(milestone.receiptDate),money(milestone.amountUsd) -
          money(milestone.modeledPartnerShareUsd));
      }
      const days = [...events.keys()].sort((a,b) => a-b);
      let balance = money(source.openingBalanceUsd), low = balance, beforeLow = balance;
      let lowDay = days[0], beforeLowDay = days[0], beforeAward = balance;
      for (let day=days[0]; day<=days[days.length-1]; day++) {
        balance += events.get(day) || 0n;
        if (balance < low) { low = balance; lowDay = day; }
        if (day < award) {
          beforeAward = balance;
          if (balance < beforeLow) { beforeLow = balance; beforeLowDay = day; }
        }
        checkedDailyRows++;
      }
      const result = {
        grantReviewPaymentLagDays:source.grantReviewPaymentLagDays,
        postStartCollectionDelayDays:source.postStartCollectionDelayDays,
        openingBalanceUsd:source.openingBalanceUsd,
        peakFundingUsd:usd(low < 0n ? -low : 0n),
        peakDate:stamp(lowDay),
        preAwardPeakFundingUsd:usd(beforeLow < 0n ? -beforeLow : 0n),
        preAwardPeakDate:stamp(beforeLowDay),
        balanceBeforeAwardUsd:usd(beforeAward),
        finalBalanceUsd:usd(balance),
        firstDate:stamp(days[0]),lastDate:stamp(days[days.length-1])
      };
      for (const [key,value] of Object.entries(result))
        if (String(source[key]) !== String(value))
          throw new Error(alternative.id + ": retained cash result differs at " + key);
      curves.push(result);
    }
    const historicalEnding = money(curves[0].finalBalanceUsd);
    results.push({
      id:alternative.id, label:alternative.label,
      hours:alternative.summary.effort_hours,
      laborCostUsd:usd(phaseCost),
      originalFinalBalanceUsd:usd(historicalEnding),
      lutraAllowanceUsd:usd(alternative.selection.commercial ? reserve : 0n),
      finalBalanceAfterLutraAllowanceUsd:usd(historicalEnding -
        (alternative.selection.commercial ? reserve : 0n)),
      cash:curves
    });
  }
  return {
    schema:"stellar-forge.reviewer-financing-calculation.v1",
    alternatives:results, curves:results.reduce((n,a)=>n+a.cash.length,0),
    checkedDailyRows,
    allowanceCashTiming:data.basis.lutraReserveTiming
  };
}
