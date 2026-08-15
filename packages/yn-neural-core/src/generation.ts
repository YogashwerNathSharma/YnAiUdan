import { Tensor } from "./index.js";
import { BasicTokenizer } from "./tokenizer.js";
import { sampleToken, type SamplingOptions } from "./sampling.js";
import { TinyTransformer } from "./transformer.js";

export type GenerationOptions = SamplingOptions & { maxNewTokens?: number; stopTokenId?: number };

export function generate(model: TinyTransformer, tokenizer: BasicTokenizer, prompt: string, options: GenerationOptions = {}): string {
  const ids = tokenizer.encode(prompt, true);
  const maxNewTokens = Math.max(0, options.maxNewTokens ?? 32);
  for (let i = 0; i < maxNewTokens; i += 1) {
    const logits = model.forward(ids);
    const last = logits.data.slice((logits.shape[0] - 1) * logits.shape[1], logits.shape[0] * logits.shape[1]);
    const next = sampleToken(new Tensor(last, [logits.shape[1]]), options);
    ids.push(next);
    if (options.stopTokenId !== undefined && next === options.stopTokenId) break;
    if (tokenizer.eosId !== undefined && next === tokenizer.eosId) break;
    if (ids.length >= model.config.contextLength) break;
  }
  return tokenizer.decode(ids);
}
