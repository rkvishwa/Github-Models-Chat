const form = document.getElementById("chat-form");
const messagesEl = document.getElementById("messages");
const promptEl = document.getElementById("prompt");
const modelEl = document.getElementById("model");
const modelStatusEl = document.getElementById("model-status");
const sendButton = document.getElementById("send");

const fallbackModels = [
  {
    id: "openai/gpt-5-chat",
    name: "OpenAI GPT-5 Chat",
    publisher: "OpenAI",
    isChatCompatible: true
  }
];

const history = [
  {
    role: "system",
    content: "You are a helpful assistant."
  }
];

function addMessage(role, content) {
  const item = document.createElement("article");
  item.className = `msg ${role}`;

  const roleLabel = document.createElement("span");
  roleLabel.className = "role";
  roleLabel.textContent = role;

  const body = document.createElement("div");
  body.textContent = content;

  item.append(roleLabel, body);
  messagesEl.append(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setModelStatus(text, isError = false) {
  modelStatusEl.textContent = text;
  modelStatusEl.dataset.state = isError ? "error" : "ok";
}

function buildModelLabel(model) {
  return `${model.publisher} - ${model.name} (${model.id})`;
}

function renderModelOptions(models, preferredModelId) {
  modelEl.innerHTML = "";

  const chatGroup = document.createElement("optgroup");
  chatGroup.label = "Chat compatible";

  const otherGroup = document.createElement("optgroup");
  otherGroup.label = "Other catalog models";

  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = buildModelLabel(model);

    if (model.isChatCompatible) {
      chatGroup.append(option);
    } else {
      option.textContent = `${option.textContent} (not chat compatible)`;
      option.disabled = true;
      otherGroup.append(option);
    }
  });

  if (chatGroup.children.length > 0) {
    modelEl.append(chatGroup);
  }

  if (otherGroup.children.length > 0) {
    modelEl.append(otherGroup);
  }

  const canUsePreferred = models.some((model) => model.id === preferredModelId && model.isChatCompatible);
  if (canUsePreferred) {
    modelEl.value = preferredModelId;
    return;
  }

  const firstChatCompatible = models.find((model) => model.isChatCompatible);
  modelEl.value = firstChatCompatible ? firstChatCompatible.id : "";
}

function loadFallbackModels(message) {
  renderModelOptions(fallbackModels, fallbackModels[0].id);
  setModelStatus(message, true);
}

async function loadModels() {
  modelEl.disabled = true;
  setModelStatus("Loading models from GitHub catalog...");

  try {
    const response = await fetch("/api/models", {
      method: "GET"
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || "Failed to fetch models");
    }

    const models = Array.isArray(data?.models) ? data.models : [];
    if (!models.length) {
      throw new Error("No models were returned from the GitHub catalog");
    }

    renderModelOptions(models, data?.defaultModel);
    modelEl.disabled = false;

    const compatibleCount = models.filter((model) => model.isChatCompatible).length;
    setModelStatus(`Loaded ${compatibleCount} chat models (${models.length} total catalog models).`);
  } catch (error) {
    loadFallbackModels(
      `Unable to load full model catalog: ${error instanceof Error ? error.message : String(error)}`
    );
    modelEl.disabled = false;
  }
}

addMessage("assistant", "Hello! Ask me anything.");
loadModels();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptEl.value.trim();
  const model = modelEl.value.trim();

  if (!prompt || !model) {
    return;
  }

  addMessage("user", prompt);
  history.push({ role: "user", content: prompt });
  promptEl.value = "";

  sendButton.disabled = true;
  sendButton.textContent = "Sending...";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: history
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const reason = data?.error || "Request failed";
      const hint = data?.hint ? `\nHint: ${data.hint}` : "";
      addMessage("assistant", `Error: ${reason}${hint}`);
      return;
    }

    const assistantReply = data?.message || "No response received.";
    addMessage("assistant", assistantReply);
    history.push({ role: "assistant", content: assistantReply });
  } catch (error) {
    addMessage("assistant", `Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Send";
    promptEl.focus();
  }
});
