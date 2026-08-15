import { Tensor, rmsNorm } from "./index.js";
import { Embedding, FeedForward, Linear, causalAttention } from "./layers.js";

export type TransformerConfig = {
  vocabSize: number;
  contextLength: number;
  hiddenSize: number;
  intermediateSize: number;
};

export class TransformerBlock {
  constructor(
    private readonly q: Linear,
    private readonly k: Linear,
    private readonly v: Linear,
    private readonly out: Linear,
    private readonly ff: FeedForward,
  ) {}

  forward(input: Tensor): Tensor {
    const normalized = rmsNorm(input);
    const attention = causalAttention(this.q.forward(normalized), this.k.forward(normalized), this.v.forward(normalized));
    const residual = input.add(this.out.forward(attention));
    return residual.add(this.ff.forward(residual));
  }
}

export class TinyTransformer {
  constructor(
    public readonly config: TransformerConfig,
    private readonly tokenEmbedding: Embedding,
    private readonly blocks: readonly TransformerBlock[],
    private readonly lmHead: Linear,
  ) {}

  forward(tokenIds: readonly number[]): Tensor {
    if (tokenIds.length > this.config.contextLength) throw new Error("Context length exceeded");
    let hidden = this.tokenEmbedding.forward(tokenIds);
    for (const block of this.blocks) hidden = block.forward(hidden);
    return this.lmHead.forward(rmsNorm(hidden));
  }
}
