import type {
  Actor,
  Cast,
  ClassDescription,
  Serenity,
} from '@serenity-js/core';

declare module 'vitest' {
  interface ProvidedContext {
    serenity?: {
      /**
       * A list of [class descriptions](https://serenity-js.org/api/core/#ClassDescription)
       * that build or represent [stage crew member builders](https://serenity-js.org/api/core/interface/StageCrewMemberBuilder/)
       * or [stage crew members](https://serenity-js.org/api/core/interface/StageCrewMember/)
       * to be notified of [Serenity/JS domain events](https://serenity-js.org/api/core-events/class/DomainEvent/)
       * that occur during the scenario execution.
       */
      crew?: ClassDescription[];

      /**
       * The maximum amount of time between [SceneFinishes](https://serenity-js.org/api/core-events/class/SceneFinishes/)
       * and [SceneFinished](https://serenity-js.org/api/core-events/class/SceneFinished/)
       * events that Serenity/JS should wait for any post-scenario async
       * operations to complete. Those include generating the screenshots,
       * saving reports to disk, [dismissing the actors](https://serenity-js.org/api/core/interface/Discardable/),
       * and so on.
       *
       * Defaults to 5 seconds.
       *
       * **Please note** that this is not
       * a scenario timeout, which should be configured in your test runner.
       */
      cueTimeout?: number;

      /**
       * The maximum default amount of time allowed for interactions such as
       * [`Wait.until`](https://serenity-js.org/api/core/class/Wait/#until)
       * to complete.
       *
       * Defaults to 5000 milliseconds, can be overridden per interaction.
       *
       * **Please note** that this is not
       * a scenario timeout, which should be configured in your test runner.
       */
      interactionTimeout?: number;

      /**
       * The name of the default [`actor`](https://serenity-js.org/api/core/class/Actor/)
       * injected into a test scenario.
       */
      defaultActorName?: string;
    };
  }
}

declare module '@vitest/runner' {
  interface TestContext {
    /**
     * Retrieves the [root](https://serenity-js.org/api/core/class/Serenity/)
     * object of the Serenity/JS framework.
     */
    serenity: Serenity;

    /**
     * Default [`actor`](https://serenity-js.org/api/core/class/Actor/)
     * injected into a test scenario.
     */
    actor: Actor;

    /**
     * Uses the provided [cast](https://serenity-js.org/api/core/class/Cast/)
     * to instantiate an [`Actor`](https://serenity-js.org/api/core/class/Actor/)
     * called `name` and inject it into a [test scenario](https://serenity-js.org/api/core/class/Stage/).
     *
     * Retrieves an existing actor if one has already been instantiated.
     */
    actorCalled(name: string): Actor;

    /**
     * Default [`cast`](https://serenity-js.org/api/core/class/Cast/)
     * injected into a test scenario.
     */
    actors: Cast;
  }
}
