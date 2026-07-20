export function allocateByWeight(total: number, weights: number[]) {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = weights.map((weight) => (total * weight) / weightTotal);
  const allocated = raw.map(Math.floor);
  const remaining = total - allocated.reduce((sum, count) => sum + count, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) allocated[order[index].index] += 1;
  return allocated;
}
