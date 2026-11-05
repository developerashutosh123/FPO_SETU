export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/** Runs at most `n` tasks at once, starting them in the order they were queued. */
export function createLimiter(n: number): Limiter {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    while (active < n && queue.length) { active++; queue.shift()!(); }
  };
  return <T,>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => { Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; next(); }); });
      next();
    });
}
