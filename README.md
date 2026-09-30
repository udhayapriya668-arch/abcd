# EduGenie

EduGenie is a Gemini-powered learning assistant for exploring concepts, practising with a quiz coach, and building study plans. It uses Gemini 3.8 Flash by default through a small built-in Node server that keeps the Gemini API key out of the browser; no npm packages are required.

## Run locally

Requires Node.js 18 or newer.

1. Copy `.env.example` to `.env` and replace the `GEMINI_API_KEY` placeholder with your Google AI Studio key. The `.env` file is ignored by Git.
2. Start or restart the app:

	```sh
	npm start
	```

3. Open [http://localhost:3000](http://localhost:3000).

Set `GEMINI_MODEL` in `.env` or your hosting environment to override the default model, or set `PORT` to use a different port. Without an API key, the study workspace still loads and shows instructions for connecting Gemini when you ask a question.