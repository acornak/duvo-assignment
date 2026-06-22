import Anthropic from "@anthropic-ai/sdk";

export interface JudgeInput {
  prompt: string;
  artifactName: string;
  artifactPreview: string;
}

export interface JudgeOutput {
  score: number; // 0..1
  reasons: string[];
}

export async function judge(input: JudgeInput): Promise<JudgeOutput> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const model = process.env.JUDGE_MODEL || "claude-opus-4-8";

  const userContent = [
    "You are evaluating whether an automation agent successfully completed a task.",
    "Score from 0.0 (total failure) to 1.0 (fully successful) and give 1-4 short reasons.",
    "Judge whether the artifact actually satisfies the task — correct content, plausible and non-empty data, right format.",
    "Return ONLY a JSON object with this exact shape: {\"score\": <number 0-1>, \"reasons\": [<string>, ...]}",
    "Do not include any other text, explanation, or markdown.",
    "",
    `TASK:\n${input.prompt}`,
    "",
    `ARTIFACT (${input.artifactName}), first portion:\n${input.artifactPreview}`,
  ].join("\n");

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
  let parsed: JudgeOutput;
  try {
    parsed = JSON.parse(raw) as JudgeOutput;
  } catch {
    parsed = { score: 0, reasons: ["Judge returned unparseable output."] };
  }
  const score = Math.max(0, Math.min(1, Number(parsed.score) || 0));
  const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [];
  return { score, reasons };
}
