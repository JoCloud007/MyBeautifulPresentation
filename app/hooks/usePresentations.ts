import useSWR from "swr";
import { useCallback } from "react";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  });

export function usePresentations() {
  const { data, error, isLoading, mutate } = useSWR("/api/presentations", fetcher);

  const createPresentation = useCallback(
    async (payload: unknown) => {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(res.statusText);
      const result = await res.json();
      mutate();
      return result;
    },
    [mutate]
  );

  return {
    presentations: data,
    isLoading,
    error,
    mutate,
    createPresentation,
  };
}

export function usePresentation(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/presentations/${id}` : null,
    fetcher
  );

  const updatePresentation = useCallback(
    async (payload: unknown) => {
      if (!id) return;
      const res = await fetch(`/api/presentations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(res.statusText);
      const result = await res.json();
      mutate();
      return result;
    },
    [id, mutate]
  );

  const deletePresentation = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/presentations/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(res.statusText);
    mutate();
  }, [id, mutate]);

  return {
    presentation: data,
    isLoading,
    error,
    mutate,
    updatePresentation,
    deletePresentation,
  };
}
