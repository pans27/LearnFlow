import { useEffect, useState } from "react";
export function useData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    load()
      .then((x) => {
        if (active) setData(x);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [...deps, version]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}
