# Serenity/JS Vitest

A module that integrates [Serenity/JS](https://serenity-js.org/) with
[Vitest](https://vitest.dev/) testing framework.

## Installation

```sh
npm install -D @dlenroc/vitest-serenity-js
```

## Usage

Add `"@dlenroc/vitest-serenity-js/setup"` to `setupFiles` and configure as
needed.

```ts
import type {} from '@dlenroc/vitest-serenity-js/setup';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['@dlenroc/vitest-serenity-js/setup'],
    provide: {
      serenity: {
        crew: [
          '@serenity-js/serenity-bdd',
          [
            '@serenity-js/core:ArtifactArchiver',
            { outputDirectory: './target/site/serenity' },
          ],
        ],
      },
    },
  },
});
```

Check out the [ProvidedContext](./src/setup.d.ts) for all available Serenity/JS
configuration options and the [TestContext](./src/setup.d.ts) for information
about injected fixtures.
