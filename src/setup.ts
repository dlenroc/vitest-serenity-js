import {
  AssertionError,
  Cast,
  Duration,
  ErrorSerialiser,
  ImplementationPendingError,
  Serenity,
  TakeNotes,
  TestCompromisedError,
  UnknownError,
  type Actor,
  type StageCrewMember,
} from '@serenity-js/core';
import {
  RetryableSceneDetected,
  SceneFinished,
  SceneFinishes,
  SceneStarts,
  SceneTagged,
  TaskFinished,
  TaskStarts,
  TestRunFinished,
  TestRunFinishes,
  TestRunnerDetected,
  TestRunStarts,
  TestSuiteFinished,
  TestSuiteStarts,
  type DomainEvent,
} from '@serenity-js/core/lib/events';
import {
  FileSystem,
  FileSystemLocation,
  Path,
  RequirementsHierarchy,
} from '@serenity-js/core/lib/io';
import {
  ActivityDetails,
  ArbitraryTag,
  Category,
  CorrelationId,
  ExecutionCompromised,
  ExecutionFailedWithAssertionError,
  ExecutionFailedWithError,
  ExecutionIgnored,
  ExecutionRetriedTag,
  ExecutionSuccessful,
  ImplementationPending,
  Name,
  ScenarioDetails,
  Tags,
  TestSuiteDetails,
} from '@serenity-js/core/lib/model';
import process from 'node:process';
import {
  beforeEach,
  inject,
  type RunnerTask,
  type RunnerTestSuite,
} from 'vitest';

const requirementsHierarchy = new RequirementsHierarchy(
  new FileSystem(new Path(process.cwd()))
);

const config = inject('serenity');
const defaultActorName = config?.defaultActorName ?? 'Vitest';
const cueTimeout = Duration.ofMilliseconds(config?.cueTimeout ?? 5000);
const interactionTimeout = Duration.ofMilliseconds(
  config?.interactionTimeout ?? 5000
);

beforeEach(({ task, onTestFinished }) => {
  if (!('context' in task)) return;

  const serenity = new Serenity();

  serenity.configure({
    crew: [new ErrorProcessor(), ...(config?.crew ?? [])],
    cueTimeout,
    interactionTimeout,
  });

  {
    let stage = serenity;
    Object.defineProperty(task.context, 'serenity', {
      get: () => stage,
      set: (value) => (stage = value),
      configurable: true,
    });

    let actor: Actor | null = null;
    Object.defineProperty(task.context, 'actor', {
      get: () => actor ?? (actor = stage.theActorCalled(defaultActorName)),
      set: (value) => (actor = value),
      configurable: true,
    });

    let getActor = (name: string) => stage.theActorCalled(name);
    Object.defineProperty(task.context, 'actorCalled', {
      get: () => getActor,
      set: (value) => (getActor = value),
      configurable: true,
    });

    let cast = Cast.where((actor) =>
      actor.whoCan(TakeNotes.usingAnEmptyNotepad())
    );
    Object.defineProperty(task.context, 'actors', {
      get: () => cast,
      set: (value) => stage.engage((cast = value)),
      configurable: true,
    });
  }

  // Announce the start/end of the test run

  {
    serenity.announce(new TestRunStarts(serenity.currentTime()));

    onTestFinished(async ({}) => {
      serenity.announce(new TestRunFinishes(serenity.currentTime()));

      try {
        await serenity.waitForNextCue();

        serenity.announce(
          new TestRunFinished(new ExecutionSuccessful(), serenity.currentTime())
        );
      } catch (error) {
        serenity.announce(
          new TestRunFinished(
            new ExecutionFailedWithError(normalizeError(error)),
            serenity.currentTime()
          )
        );

        throw error;
      }
    }, cueTimeout.inMilliseconds());
  }

  // Announce the start/end of the test suite

  const suites = getSuites(task);

  {
    const details = suites.map((it) => {
      return new TestSuiteDetails(
        new Name(it.name),
        new FileSystemLocation(
          serenity.cwd().relative(new Path(it.file.filepath)),
          it.location?.line,
          it.location?.column
        ),
        CorrelationId.create()
      );
    });

    serenity.announce(
      ...details.map((it) => new TestSuiteStarts(it, serenity.currentTime()))
    );

    onTestFinished(({}) => {
      serenity.announce(
        ...details
          .reverse()
          .map(
            (it) =>
              new TestSuiteFinished(
                it,
                new ExecutionSuccessful(),
                serenity.currentTime()
              )
          )
      );
    });
  }

  // Announce the start/end of the test

  {
    const oldErrors = new Set(task.result?.errors);

    const sceneId = serenity.assignNewSceneId();

    const path = serenity.cwd().relative(new Path(task.file.filepath));
    const name = suites.slice(1).reduce((n, s) => `${s.name} ${n}`, task.name);
    const featureName = suites[0]?.name || path.value;

    const tags = Tags.from(`${featureName} ${name}`);
    const details = new ScenarioDetails(
      new Name(Tags.stripFrom(name)),
      new Category(Tags.stripFrom(featureName)),
      new FileSystemLocation(path, task.location?.line, task.location?.column)
    );

    serenity.announce(
      new SceneStarts(sceneId, details, serenity.currentTime()),

      ...requirementsHierarchy
        .requirementTagsFor(details.location.path, details.category.value)
        .map((it) => new SceneTagged(sceneId, it, serenity.currentTime())),

      new TestRunnerDetected(
        sceneId,
        new Name('Vitest'),
        serenity.currentTime()
      ),

      ...tags.map((it) => new SceneTagged(sceneId, it, serenity.currentTime()))
    );

    onTestFinished(async ({ task }) => {
      if (task.retry && task.result?.state === 'fail') {
        serenity.announce(
          new RetryableSceneDetected(sceneId, serenity.currentTime()),
          new SceneTagged(
            sceneId,
            new ArbitraryTag('retried'),
            serenity.currentTime()
          )
        );

        if (task.result?.retryCount) {
          serenity.announce(
            new SceneTagged(
              sceneId,
              new ExecutionRetriedTag(task.result.retryCount),
              serenity.currentTime()
            )
          );
        }
      }

      /**
       * Serenity doesn't allow for more than one failure per activity,
       * but Vitest does. If there are multiple failures we wrap them up in
       * fake activities so that they're all reported correctly.
       */
      const errors =
        task.result?.errors?.filter((it) => !oldErrors.has(it)) ?? [];

      if (errors.length > 1) {
        for (const error of errors) {
          const activityDetails = new ActivityDetails(
            new Name('Expectation'),
            new FileSystemLocation(path)
          );

          const activityId = serenity.assignNewActivityId(activityDetails);

          serenity.announce(
            new TaskStarts(
              sceneId,
              activityId,
              activityDetails,
              serenity.currentTime()
            ),
            new TaskFinished(
              sceneId,
              activityId,
              activityDetails,
              failureOutcomeFrom(error),
              serenity.currentTime()
            )
          );
        }
      }

      serenity.announce(new SceneFinishes(sceneId, serenity.currentTime()));

      try {
        await serenity.waitForNextCue();

        const result = errors.length
          ? errors
              .map((it) => ({ error: it, outcome: failureOutcomeFrom(it) }))
              .reduce((a, b) => (!a.outcome.isWorseThan(b.outcome) ? b : a))
              ?.error
          : null;

        const outcome =
          task.result?.state === 'pass'
            ? new ExecutionSuccessful()
            : (task.result?.retryCount ?? 0) < (task.retry ?? 0)
            ? new ExecutionIgnored(normalizeError(result))
            : failureOutcomeFrom(result);

        serenity.announce(
          new SceneFinished(sceneId, details, outcome, serenity.currentTime())
        );
      } catch (error) {
        serenity.announce(
          new SceneFinished(
            sceneId,
            details,
            new ExecutionFailedWithError(normalizeError(error)),
            serenity.currentTime()
          )
        );

        throw error;
      }
    }, cueTimeout.inMilliseconds());
  }
});

function getSuites(task: RunnerTask): RunnerTestSuite[] {
  const suites = [];

  for (let suite = task.suite; suite; suite = suite.suite) {
    suites.push(suite);
  }

  return suites.reverse();
}

function failureOutcomeFrom(cause?: unknown) {
  const error = normalizeError(cause);

  if (error instanceof AssertionError) {
    return new ExecutionFailedWithAssertionError(error);
  }

  if (error instanceof ImplementationPendingError) {
    return new ImplementationPending(error);
  }

  if (error instanceof TestCompromisedError) {
    return new ExecutionCompromised(error);
  }

  return new ExecutionFailedWithError(error);
}

function normalizeError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }

  const error = ErrorSerialiser.deserialise(cause as {});
  if (error instanceof Error) {
    if (typeof error.constructor !== 'function') {
      error.constructor = { [error.name]: () => {} }[error.name]!;
    }

    if (error.cause) {
      error.cause = normalizeError(error.cause);
    }

    return error;
  }

  return new UnknownError(String(cause));
}

class ErrorProcessor implements StageCrewMember {
  assignedTo(): this {
    return this;
  }

  notifyOf(event: DomainEvent): void {
    const { outcome } = event as { outcome?: { error?: unknown } };
    if (outcome?.error instanceof Error) {
      outcome.error = ErrorSerialiser.deserialise(
        ErrorSerialiser.serialise(outcome.error)
      );
    }
  }
}
