"use client";

import { useState, useRef, useCallback, ReactNode } from "react";

interface ResizablePanelProps {
  children: ReactNode;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  side?: "left" | "right";
  storageKey?: string;
  className?: string;
}

export function ResizablePanel({
  children,
  defaultWidth,
  minWidth = 200,
  maxWidth = 600,
  side = "left",
  storageKey,
  className = "",
}: ResizablePanelProps) {
  const saved = storageKey && typeof window !== "undefined"
    ? Number(localStorage.getItem(storageKey)) || defaultWidth
    : defaultWidth;

  const [width, setWidth] = useState(saved);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = side === "left"
        ? moveEvent.clientX - startXRef.current
        : startXRef.current - moveEvent.clientX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta));
      setWidth(newWidth);
      if (storageKey) {
        localStorage.setItem(storageKey, String(newWidth));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [width, minWidth, maxWidth, side, storageKey]);

  return (
    <div
      className={`flex-shrink-0 flex ${className}`}
      style={{ width: `${width}px` }}
    >
      {side === "right" && (
        <div
          onMouseDown={handleMouseDown}
          className={`w-1 flex-shrink-0 bg-slate-200 hover:bg-slate-400 transition-colors cursor-col-resize ${isResizing ? "bg-slate-500" : ""}`}
        />
      )}
      <div className="flex-1 overflow-hidden">{children}</div>
      {side === "left" && (
        <div
          onMouseDown={handleMouseDown}
          className={`w-1 flex-shrink-0 bg-slate-200 hover:bg-slate-400 transition-colors cursor-col-resize ${isResizing ? "bg-slate-500" : ""}`}
        />
      )}
    </div>
  );
}
