const form = document.getElementById("chat-form");
const messagesEl = document.getElementById("messages");
const promptEl = document.getElementById("prompt");
const modelEl = document.getElementById("model");
const sendButton = document.getElementById("send");

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

addMessage("assistant", "Hello! Ask me anything.");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptEl.value.trim();
  const model = modelEl.value.trim();

  if (!prompt) {
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
      addMessage("assistant", `Error: ${reason}`);
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
