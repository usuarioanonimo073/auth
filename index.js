const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BOT_TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const REDIRECT_URI = process.env.REDIRECT_URI;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

const required = {
  CLIENT_ID,
  CLIENT_SECRET,
  BOT_TOKEN,
  GUILD_ID,
  ROLE_ID,
  REDIRECT_URI
};

for (const [name, value] of Object.entries(required)) {
  if (!value) {
    console.error(`Variável obrigatória ausente: ${name}`);
    process.exit(1);
  }
}

const siteDir = fs.existsSync(path.join(__dirname, "site", "index.html"))
  ? path.join(__dirname, "site")
  : __dirname;

const indexPath = path.join(siteDir, "index.html");

function page(title, message, status = 400) {
  return `
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: #0b0b10;
          color: #f5f5f5;
          font-family: Arial, sans-serif;
        }
        main {
          max-width: 420px;
          margin: 20px;
          padding: 30px;
          background: #17171f;
          border: 1px solid #30303c;
          border-radius: 16px;
          text-align: center;
        }
        p { color: #c7c7d1; line-height: 1.6; }
        a { color: #a5b4fc; }
      </style>
    </head>
    <body>
      <main>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="/">Voltar ao início</a>
      </main>
    </body>
    </html>
  `;
}

function getCookie(req, name) {
  const cookies = (req.headers.cookie || "").split(";");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
