const path = require("node:path");
const express = require("express");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);
const githubToken = process.env.GITHUB_TOKEN;
const githubOrg = (process.env.GITHUB_ORG || "").trim();
const defaultModel = "openai/gpt-5-chat";
const apiVersion = "2026-03-10";
const inferenceEndpoint = githubOrg
  ? `https://models.github.ai/orgs/${encodeURIComponent(githubOrg)}/inference/chat/completions`
  : "https://models.github.ai/inference/chat/completions";
const catalogEndpoint = "https://models.github.ai/catalog/models";
const modelCatalogCacheMs = 5 * 60 * 1000;

let modelCatalogCache = {
  models: null,
  fetchedAt: 0
};

function getGitHubHeaders(contentType = false) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${githubToken}`,
    "X-GitHub-Api-Version": apiVersion
  };

  if (contentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function isChatCompatible(model) {
  const input = Array.isArray(model?.supported_input_modalities)
    ? model.supported_input_modalities
    : [];
  const output = Array.isArray(model?.supported_output_modalities)
    ? model.supported_output_modalities
    : [];

  if (!input.length && !output.length) {
    return true;
  }

  return input.includes("text") && output.includes("text");
}

function normalizeCatalogModels(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((item) => item && typeof item.id === "string" && item.id.trim())
    .map((item) => {
      const id = item.id.trim();
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : id;
      const publisher =
        typeof item.publisher === "string" && item.publisher.trim() ? item.publisher.trim() : "Unknown";

      return {
        id,
        name,
        publisher,
        isChatCompatible: isChatCompatible(item)
      };
    })
    .sort((a, b) => {
      if (a.isChatCompatible !== b.isChatCompatible) {
        return a.isChatCompatible ? -1 : 1;
      }

      const publisherOrder = a.publisher.localeCompare(b.publisher);
      if (publisherOrder !== 0) {
        return publisherOrder;
      }

      return a.name.localeCompare(b.name);
    });
}

async function getCatalogModels(forceRefresh = false) {
  const cacheAge = Date.now() - modelCatalogCache.fetchedAt;
  if (!forceRefresh && modelCatalogCache.models && cacheAge < modelCatalogCacheMs) {
    return modelCatalogCache.models;
  }

  const response = await fetch(catalogEndpoint, {
    method: "GET",
    headers: getGitHubHeaders(false)
  });

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Failed to fetch model catalog";
    throw new Error(message);
  }

  const models = normalizeCatalogModels(payload);
  modelCatalogCache = {
    models,
    fetchedAt: Date.now()
  };

  return models;
}

function pickDefaultModel(models) {
  const preferred = models.find((model) => model.id === defaultModel && model.isChatCompatible);
  if (preferred) {
    return preferred.id;
  }

  const firstChatCompatible = models.find((model) => model.isChatCompatible);
  if (firstChatCompatible) {
    return firstChatCompatible.id;
  }

  return defaultModel;
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/models", async (_req, res) => {
  if (!githubToken) {
    return res.status(500).json({
      error: "Missing GITHUB_TOKEN in .env file"
    });
  }

  try {
    const models = await getCatalogModels(false);
    return res.json({
      models,
      defaultModel: pickDefaultModel(models)
    });
  } catch (error) {
    return res.status(502).json({
      error: "Failed to load model catalog",
      details: error instanceof Error ? error.message : String(error)
    });
  }
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
      headers: getGitHubHeaders(true),
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

      if (response.status === 403) {
        if (githubOrg) {
          payload.hint =
            "Model usage may be limited for this account or organization grant. Try a different model like openai/gpt-5-chat.";
        } else {
          payload.hint =
            "This request is attributed to your personal account because GITHUB_ORG is empty. If your token is from an organization grant, set GITHUB_ORG in .env and restart the server.";
        }
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
