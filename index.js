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
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b10;color:#f5f5f5;font-family:Arial,sans-serif}
main{max-width:420px;margin:20px;padding:30px;background:#17171f;border:1px solid #30303c;border-radius:16px;text-align:center}
p{color:#c7c7d1;line-height:1.6}a{color:#a5b4fc}
</style>
</head>
<body><main><h1>${title}</h1><p>${message}</p><a href="/">Voltar ao início</a></main></body>
</html>`;
}

function getCookie(req, name) {
  const cookies = (req.headers.cookie || "").split(";");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;

    const key = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1).trim();

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return "";
      }
    }
  }

  return "";
}

async function discordRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(`Discord API respondeu HTTP ${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return { response, data };
}

async function sendLog(message) {
  if (!LOG_CHANNEL_ID) return;

  try {
    await discordRequest(
      `https://discord.com/api/v10/channels/${LOG_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: message })
      }
    );
  } catch (error) {
    console.error("Erro ao enviar log:", error.message);
  }
}

app.get("/login", (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");

  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/"
  });

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: "identify guilds.join",
    state
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get("/oauth2/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const savedState = getCookie(req, "oauth_state");

  res.clearCookie("oauth_state", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/"
  });

  if (error) {
    return res.status(400).send(
      page("Login cancelado", "Você recusou ou cancelou a autorização.")
    );
  }

  if (
    typeof code !== "string" ||
    typeof state !== "string" ||
    !savedState ||
    state !== savedState
  ) {
    return res.status(400).send(
      page("Falha na autenticação", "Estado OAuth2 inválido. Tente entrar novamente.")
    );
  }

  try {
    const form = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    });

    const { data: tokenData } = await discordRequest(
      "https://discord.com/api/v10/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form
      }
    );

    if (!tokenData.access_token) {
      throw new Error("O Discord não retornou um token de acesso.");
    }

    const { data: user } = await discordRequest(
      "https://discord.com/api/v10/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    await discordRequest(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${user.id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          access_token: tokenData.access_token
        })
      }
    );

    await discordRequest(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${user.id}/roles/${ROLE_ID}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`
        }
      }
    );

    console.log(`OAuth2 concluído para o usuário ${user.id}`);

    await sendLog(`OAuth2 concluído para <@${user.id}> (\`${user.id}\`).`);

    return res.redirect(
      `/?status=ok&guild=${encodeURIComponent(GUILD_ID)}`
    );
  } catch (error) {
    console.error("Erro no callback OAuth2:", error.message);

    if (error.details) {
      console.error("Detalhes:", JSON.stringify(error.details));
    }

    await sendLog("Falha durante o processamento do OAuth2.");

    return res.status(500).send(
      page(
        "Não foi possível concluir",
        "Confira as permissões do bot e tente novamente."
      )
    );
  }
});

app.use(express.static(siteDir));

app.get("/", (req, res) => {
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  return res.send(
    page("Auth Discord", 'Servidor online. <a href="/login">Entrar com Discord</a>', 200)
  );
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});
