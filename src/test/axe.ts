import axe from 'axe-core';

/**
 * Runs axe over the rendered page and returns readable violations (empty when
 * clean). Colour contrast needs real layout, which jsdom doesn't have, so it is
 * checked separately against the palette tokens.
 */
export async function axeViolations(root: Element = document.body): Promise<string[]> {
  const results = await axe.run(root, {
    resultTypes: ['violations'],
    rules: {
      'color-contrast': { enabled: false },
      // Needs canvas to spot icon fonts, which jsdom lacks. Our icons are SVG with aria-hidden.
      'label-content-name-mismatch': { enabled: false },
    },
  });
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes.map((node) => `    ${node.target.join(' ')}  ${node.html.slice(0, 120)}`).join('\n'),
  );
}
