/** Short thoughts for the home screen. A new one shows each time a new chat starts. */
export const THOUGHTS = [
  "Small steps every day.",
  "Curiosity is a superpower.",
  "Progress, not perfection.",
  "Every expert was once a beginner.",
  "Learn something new today.",
  "Mistakes are proof you're trying.",
  "One page at a time.",
  "Your future self will thank you.",
  "Stay curious.",
  "Big goals start small.",
  "Ask. Learn. Grow.",
  "Today is a good day to learn.",
  "Keep going, you're doing great.",
  "Good questions lead to answers.",
  "Practice makes progress.",
  "Dream big, start small.",
  "Knowledge grows when shared.",
  "Believe you can, then learn how.",
  "Consistency is the secret.",
  "Focus on what you can learn now.",
];

/** A thought at random, never the same as `previous`. */
export function pickThought(previous?: string): string {
  const options = THOUGHTS.filter((t) => t !== previous);
  return options[Math.floor(Math.random() * options.length)];
}
