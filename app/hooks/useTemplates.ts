import useSWR from "swr";
import { useCallback } from "react";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  });

export function useTemplates() {
  const { data, error, isLoading, mutate } = useSWR("/api/templates", fetcher);

  const createTemplate = useCallback(
    async (payload: unknown) => {
      const res = await fetch("/api/templates", {
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
    templates: data,
    isLoading,
    error,
    mutate,
    createTemplate,
  };
}

export function useTemplate(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/templates/${id}` : null,
    fetcher
  );

  const updateTemplate = useCallback(
    async (payload: unknown) => {
      if (!id) return;
      const res = await fetch(`/api/templates/${id}`, {
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

  const deleteTemplate = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(res.statusText);
    mutate();
  }, [id, mutate]);

  return {
    template: data,
    isLoading,
    error,
    mutate,
    updateTemplate,
    deleteTemplate,
  };
}
