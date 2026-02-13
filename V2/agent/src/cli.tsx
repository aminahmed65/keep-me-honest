import React, { useState, useCallback } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { createAgent } from "./agent.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Error: Set OPENROUTER_API_KEY environment variable");
  process.exit(1);
}

const agent = createAgent(apiKey);

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

function App() {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content:
        "Keep Me Honest Agent — paste a transcript to extract promises.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [streamText, setStreamText] = useState("");

  useInput((_, key) => {
    if (key.escape) exit();
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim() || isThinking) return;

      const userMsg: Message = { role: "user", content: value.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsThinking(true);
      setStreamText("");

      try {
        const result = await agent.chat(value.trim());
        let accumulated = "";

        for await (const delta of result.getTextStream()) {
          accumulated += delta;
          setStreamText(accumulated);
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: accumulated },
        ]);
        setStreamText("");
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${err.message}` },
        ]);
      }

      setIsThinking(false);
    },
    [isThinking]
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Keep Me Honest
        </Text>
        <Text color="gray"> — press Esc to quit</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <Box key={i} marginBottom={0}>
            {msg.role === "system" ? (
              <Text color="gray" italic>
                {msg.content}
              </Text>
            ) : msg.role === "user" ? (
              <Text>
                <Text color="cyan" bold>
                  You:{" "}
                </Text>
                <Text>{msg.content}</Text>
              </Text>
            ) : (
              <Text>
                <Text color="green" bold>
                  Agent:{" "}
                </Text>
                <Text>{msg.content}</Text>
              </Text>
            )}
          </Box>
        ))}

        {streamText && (
          <Text>
            <Text color="green" bold>
              Agent:{" "}
            </Text>
            <Text>{streamText}</Text>
            <Text color="gray">|</Text>
          </Text>
        )}
      </Box>

      {isThinking && !streamText && (
        <Box marginBottom={1}>
          <Text color="yellow">Thinking...</Text>
        </Box>
      )}

      <Box>
        <Text color="cyan" bold>
          {"You: "}
        </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Paste transcript or type message..."
        />
      </Box>
    </Box>
  );
}

render(<App />);
