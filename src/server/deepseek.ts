// Credentials live in this process only. Never serialize configuration inputs.
const BASE = "https://api.deepseek.com";
const MODEL = "deepseek-flash";
let credential = process.env.DEEPSEEK_API_KEY ?? "";
export function modelStatus() {
  return {
    configured: Boolean(credential),
    baseURL: BASE,
    model: MODEL,
    storage: "process-memory-only",
  };
}
export function configureModel(input: { apiKey?: string; clear?: boolean }) {
  if (input.clear) {
    credential = "";
    return modelStatus();
  }
  if (
    typeof input.apiKey !== "string" ||
    !input.apiKey.startsWith("sk-") ||
    input.apiKey.length < 16 ||
    input.apiKey.length > 256
  )
    throw new Error("请输入有效的 DeepSeek API 密钥");
  credential = input.apiKey.trim();
  return modelStatus();
}
export function redact(value: string) {
  let text = String(value);
  if (credential) text = text.split(credential).join("[redacted]");
  return text.replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, "[redacted]");
}
export async function deepseekChat(
  messages: any[],
  options: {
    tools?: any[];
    maxTokens?: number;
    thinking?: boolean;
    signal?: AbortSignal;
  } = {},
) {
  if (!credential)
    throw new Error("尚未配置 DeepSeek 密钥。密钥仅在本机进程内保存。");
  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: options.maxTokens ?? 18000,
      thinking: { type: options.thinking === false ? "disabled" : "enabled" },
      ...(options.tools
        ? { tools: options.tools, tool_choice: "auto" }
        : { response_format: { type: "json_object" } }),
    }),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(360000)])
      : AbortSignal.timeout(360000),
  });
  if (!response.ok) {
    const body = redact((await response.text()).slice(0, 2000));
    throw new Error(`DeepSeek HTTP ${response.status}: ${body}`);
  }
  const result = await response.json();
  if (!result.choices?.[0]) throw new Error("DeepSeek 返回没有 choices 的响应");
  return result;
}
export async function testModel() {
  const r = await deepseekChat(
    [
      { role: "system", content: 'Reply with JSON {"ok":true}.' },
      { role: "user", content: "Connectivity check." },
    ],
    { maxTokens: 32, thinking: false },
  );
  return { ok: true, model: r.model, usage: r.usage };
}
