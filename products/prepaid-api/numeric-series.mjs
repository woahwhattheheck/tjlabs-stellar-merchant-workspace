// MIT. A deterministic application for the original paid-jobs runtime.
export function analyze(input, context = {}) {
  context.signal?.throwIfAborted();
  if (!input || !Array.isArray(input.values) || input.values.length < 1 || input.values.length > 10000 ||
      input.values.some(value => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) ||
      !Number.isSafeInteger(input.window) || input.window < 1 || input.window > 10000)
    throw Object.assign(new Error('JOB_INPUT_INVALID'), {code: 'JOB_INPUT_INVALID'});
  const values = input.values, sorted = [...values].sort((a, b) => a - b);
  let count = 0, mean = 0, squaredDeviations = 0, sum = 0, rollingSum = 0;
  const rows = values.map((value, index) => {
    context.signal?.throwIfAborted();
    count += 1;
    const delta = value - mean;
    mean += delta / count;
    squaredDeviations += delta * (value - mean);
    sum += value;
    rollingSum += value;
    if (index >= input.window) rollingSum -= values[index - input.window];
    return {index, value, windowMean: rollingSum / Math.min(index + 1, input.window)};
  });
  const middle = Math.floor(count / 2);
  return {
    count, minimum: sorted[0], maximum: sorted[count - 1], sum, mean,
    median: count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    populationStandardDeviation: Math.sqrt(Math.max(0, squaredDeviations / count)),
    window: input.window, rows,
  };
}
