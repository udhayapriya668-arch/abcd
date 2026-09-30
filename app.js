const form = document.querySelector('#ask-form');
const input = document.querySelector('#question-input');
const messages = document.querySelector('#messages');
const welcomeMessage = document.querySelector('#welcome-message');
const suggestions = document.querySelector('#suggestions');
const loadingMessage = document.querySelector('#loading-message');
const sendButton = document.querySelector('#send-button');
const connectionLabel = document.querySelector('#connection-label');
const connectionDot = document.querySelector('#connection-dot');
const subjectLabel = document.querySelector('#subject-label');
const storageKey = 'edugenie-conversation-v1';

let mode = 'explain';
let subject = 'All subjects';
let busy = false;
let toastTimeout;
let history = readHistory();

function readHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) => item && ['user', 'model'].includes(item.role) && typeof item.text === 'string').slice(-24);
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(storageKey, JSON.stringify(history.slice(-24)));
}

function addMessage(role, text) {
  const row = document.createElement('div');
  row.className = `message-row ${role === 'user' ? 'user' : 'assistant'}`;
  if (role === 'user') {
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;
    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.textContent = 'NP';
    row.append(content, avatar);
  } else {
    const avatar = document.createElement('span');
    avatar.className = 'genie-avatar';
    avatar.textContent = 'e';
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;
    row.append(avatar, content);
  }
  messages.append(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderHistory() {
  messages.replaceChildren();
  for (const item of history) addMessage(item.role, item.text);
  const hasHistory = history.length > 0;
  welcomeMessage.classList.toggle('hidden', hasHistory);
  suggestions.classList.toggle('hidden', hasHistory);
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 4800);
}

async function checkConnection() {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    connectionLabel.textContent = status.connected ? 'Gemini ready' : 'Connect Gemini';
    connectionDot.classList.toggle('connected', status.connected);
    connectionDot.classList.toggle('disconnected', !status.connected);
    connectionDot.title = status.connected ? 'Gemini is connected' : 'Set GEMINI_API_KEY to enable answers';
  } catch {
    connectionLabel.textContent = 'Gemini unavailable';
    connectionDot.classList.add('disconnected');
  }
}

async function ask(question) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion || busy) return;
  busy = true;
  input.value = '';
  resizeInput();
  history.push({ role: 'user', text: cleanQuestion });
  saveHistory();
  renderHistory();
  loadingMessage.classList.remove('hidden');
  sendButton.disabled = true;
  input.disabled = true;

  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: cleanQuestion, mode, subject, history: history.slice(0, -1) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
    history.push({ role: 'model', text: result.answer });
    saveHistory();
    renderHistory();
  } catch (error) {
    history.pop();
    saveHistory();
    renderHistory();
    showToast(error.message);
  } finally {
    busy = false;
    loadingMessage.classList.add('hidden');
    sendButton.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

function resizeInput() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  ask(input.value);
});

input.addEventListener('input', resizeInput);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    const placeholders = {
      explain: 'Ask anything you’re curious about…',
      quiz: 'What would you like to practise?…',
      plan: 'What are you working towards?…'
    };
    input.placeholder = placeholders[mode];
    input.focus();
  });
});

document.querySelectorAll('.suggestion, .focus-item, .text-button').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.prompt) {
      input.value = button.dataset.prompt;
      resizeInput();
      input.focus();
    }
  });
});

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
    subject = button.dataset.subject;
    subjectLabel.textContent = subject;
    if (subject !== 'All subjects') input.placeholder = `Ask me anything about ${subject.toLowerCase()}…`;
    else input.placeholder = 'Ask anything you’re curious about…';
    input.focus();
  });
});

document.querySelector('#new-chat').addEventListener('click', () => {
  history = [];
  saveHistory();
  renderHistory();
  input.value = '';
  input.focus();
});

renderHistory();
checkConnection();