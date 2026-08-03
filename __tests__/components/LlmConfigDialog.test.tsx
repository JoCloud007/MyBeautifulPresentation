import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LlmConfigDialog } from "@/app/components/LlmConfigDialog";
import { useLlmStore } from "@/app/stores/llmStore";

vi.mock("@/lib/llm", () => ({
  checkLlmAvailability: vi.fn(() => Promise.resolve(true)),
  fetchLlmModels: vi.fn(() => Promise.resolve(["llama3.2", "mistral"])),
}));

describe("LlmConfigDialog — Docker Compose & UI Polish", () => {
  beforeEach(() => {
    useLlmStore.setState({
      config: {
        provider: "ollama",
        baseUrl: "http://localhost:11434",
        model: "llama3.2",
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: "test prompt",
      },
      isAvailable: null,
      availableModels: [],
      isCheckingConnection: false,
      lastError: null,
    });
  });

  it("renders settings trigger button", () => {
    render(<LlmConfigDialog />);
    expect(screen.getByTitle("Configuration LLM")).toBeInTheDocument();
  });

  it("opens dialog when clicking settings button", () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    expect(screen.getByText("Configuration LLM")).toBeInTheDocument();
  });

  it("renders URL input with current value", () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    const input = screen.getByDisplayValue("http://localhost:11434");
    expect(input).toBeInTheDocument();
  });

  it("renders model input with current value", () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    const input = screen.getByDisplayValue("llama3.2");
    expect(input).toBeInTheDocument();
  });

  it("renders temperature slider label", () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    expect(screen.getByText("Température")).toBeInTheDocument();
  });

  it("renders max tokens slider label", () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    expect(screen.getByText("Max Tokens")).toBeInTheDocument();
  });

  it("updates baseUrl in store on input change", () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    const input = screen.getByDisplayValue("http://localhost:11434");
    fireEvent.change(input, { target: { value: "http://ollama:11434" } });
    expect(useLlmStore.getState().config.baseUrl).toBe("http://ollama:11434");
  });

  it("updates model in store on input change", () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    const input = screen.getByDisplayValue("llama3.2");
    fireEvent.change(input, { target: { value: "mistral" } });
    expect(useLlmStore.getState().config.model).toBe("mistral");
  });

  it("shows test connection button", () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    expect(screen.getByText("Tester")).toBeInTheDocument();
  });

  it("shows close button", () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    expect(screen.getByText("Fermer")).toBeInTheDocument();
  });

  it("auto-tests connection on dialog open", async () => {
    render(<LlmConfigDialog />);
    fireEvent.click(screen.getByTitle("Configuration LLM"));
    await waitFor(() => {
      expect(screen.getByText(/Connecté/)).toBeInTheDocument();
    });
  });
});
