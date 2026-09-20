// Domain messages contain data, never a translated string or a React dependency.
export type Problem =
  | { code: 'storageUnavailable' | 'storageRestore' | 'storageWrite' }
  | { code: 'fileTooLarge' | 'invalidJson' | 'invalidLibrary' | 'libraryFull' | 'fileRead' }
  | { code: 'audioSuspended' | 'audioFailed' }
  | { code: 'sampleLoad' | 'sampleDecode'; sample: string }

export type Notice =
  Problem | { code: 'nameRequired' | 'imported' } | { code: 'saved' | 'deleted'; name: string }

export class AppError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.code)
    this.name = 'AppError'
  }
}

export function problemOf(error: unknown, fallback: Problem): Problem {
  return error instanceof AppError ? error.problem : fallback
}
