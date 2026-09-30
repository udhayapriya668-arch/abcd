const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;

function loadEnvFile() {
  let contents;
  try {
    contents = fs.readFileSync(path.join(root, '.env'), 'utf8');
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    const value = match[2].replace(/^(?:"(.*)"|'(.*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
    process.env[match[1]] = value;
  }
}

loadEnvFile();

const port = Number(process.env.PORT) || 3000;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error('Request is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

async function handleAsk(request, response) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendJson(response, 503, {
      error: 'Gemini is not connected yet. Add GEMINI_API_KEY to your environment and restart EduGenie.'
    });
  }

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return sendJson(response, 400, { error: error.message });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 4_000) {
    return sendJson(response, 400, { error: 'Add a question under 4,000 characters to continue.' });
  }

  const mode = ['explain', 'quiz', 'plan'].includes(body.mode) ? body.mode : 'explain';
  const subject = typeof body.subject === 'string' ? body.subject.slice(0, 60) : 'General';
  const instructions = {
    explain: 'Explain concepts clearly, build intuition before detail, use a small example, and finish with one short check-for-understanding question. Adapt to the learner and never assume prior knowledge.',
    quiz: 'Act as a friendly quiz coach. Ask one question at a time, wait for the learner to answer, then give encouraging, specific feedback and continue with the next question. Start with the first question now.',
    plan: 'Create a realistic, step-by-step study plan with short timed sessions, breaks, and a clear first action. Ask a brief clarifying question only if the request is too vague to plan.'
  };
  const history = Array.isArray(body.history)
    ? body.history.slice(-12).filter((item) =>
      item && ['user', 'model'].includes(item.role) && typeof item.text === 'string'
    ).map((item) => ({
      role: item.role,
      parts: [{ text: item.text.slice(0, 4_000) }]
    }))
    : [];

  try {
    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: `You are EduGenie, a warm, precise learning assistant. Support learning rather than simply doing assignments for students. Subject: ${subject}. ${instructions[mode]}` }]
          },
          contents: [...history, { role: 'user', parts: [{ text: question }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1_200 }
        })
      }
    );
    const data = await result.json();
    if (!result.ok) {
      const detail = data.error?.message || 'Gemini could not complete that request.';
      return sendJson(response, result.status === 429 ? 429 : 502, { error: detail });
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n')
      .trim();
    if (!answer) {
      return sendJson(response, 502, { error: 'Gemini returned an empty answer. Try asking another way.' });
    }
    return sendJson(response, 200, { answer });
  } catch {
    return sendJson(response, 502, { error: 'Could not reach Gemini. Check your connection and try again.' });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/status') {
    return sendJson(response, 200, { connected: Boolean(process.env.GEMINI_API_KEY) });
  }
  if (request.method === 'POST' && url.pathname === '/api/ask') {
    return handleAsk(request, response);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : content);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`EduGenie is running at http://localhost:${port}`);
});