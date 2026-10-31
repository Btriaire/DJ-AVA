registerProcessor("crush", class extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "bits", defaultValue: 8, minValue: 1, maxValue: 16, automationRate: "k-rate" },
      { name: "down", defaultValue: 1, minValue: 1, maxValue: 64, automationRate: "k-rate" }
    ];
  }

  constructor() {
    super();
    this.heldValues = [];
    this.phases = [];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input.length) {
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].fill(0);
      }
      return true;
    }

    const bits = parameters.bits[0];
    const down = parameters.down[0];
    const step = 2 ** (bits - 1);

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      if (this.heldValues.length <= channel) {
        this.heldValues.push(0);
        this.phases.push(0);
      }

      for (let i = 0; i < inputChannel.length; i++) {
        this.phases[channel] += 1;

        if (this.phases[channel] >= down) {
          this.phases[channel] -= down;
          this.heldValues[channel] = Math.round(inputChannel[i] * step) / step;
        }

        outputChannel[i] = this.heldValues[channel];
      }
    }

    return true;
  }
});
