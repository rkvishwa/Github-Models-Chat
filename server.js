const path = require("node:path");
const express = require("express");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);
const githubToken = process.env.GITHUB_TOKEN;
const githubOrg = (process.env.GITHUB_ORG || "").trim();
const defaultModel = process.env.GITHUB_MODEL || "openai/gpt-4.1";
const inferenceEndpoint = githubOrg
  ? `https://models.github.ai/orgs/${encodeURIComponent(githubOrg)}/inference/chat/completions`
  : "https://models.github.ai/inference/chat/completions";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  if (!githubToken) {
    return res.status(500).json({
      error: "Missing GITHUB_TOKEN in .env file"
    });
  }

  const { messages, model } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "Request body must include a non-empty messages array"
    });
  }

  const chosenModel = typeof model === "string" && model.trim() ? model.trim() : defaultModel;

  try {
    const response = await fetch(inferenceEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10"
      },
      body: JSON.stringify({
        model: chosenModel,
        messages,
        temperature: 0.7
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const payload = {
        error: data?.error?.message || data?.message || "GitHub Models request failed",
        details: data
      };

      if (response.status === 403 && githubOrg) {
        payload.hint = "Model usage may be limited for this account or organization grant.";
      }

      return res.status(response.status).json(payload);
    }

    const assistantMessage = data?.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      return res.status(502).json({
        error: "No assistant message was returned",
        details: data
      });
    }

    return res.json({
      message: assistantMessage,
      model: chosenModel,
      usage: data?.usage || null
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to call GitHub Models API",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, () => {
  console.log(`Chat app is running on http://localhost:${port}`);
  if (githubOrg) {
    console.log(`Using org attribution: ${githubOrg}`);
  }
  if (!githubToken) {
    console.warn("GITHUB_TOKEN is not set. Add it to your .env file.");
  }
});
